"""Run the approved fixed-prefix A/B/C experiment against the production API.

Cookies remain in process memory. No provider key or private runtime setting is read.
"""
import concurrent.futures
import json
import pathlib
import random
import subprocess
import time

BASE = 'https://parable-interview-studio.zhuoshuai.chatgpt.site/api/'
SOURCE = '9b7eab54-dad4-495e-a01e-586903c32189'
OUTPUT = pathlib.Path(__file__).resolve().parents[1] / 'data' / 'diagnostics' / 'slim-v3-evaluation'


def call(path, data=None, cookie=''):
    config = ['url = ' + json.dumps(BASE + path), 'header = '+json.dumps('Expect:')]
    if cookie:
        config.append('header = ' + json.dumps('Cookie: ' + cookie))
    if data is not None:
        config += ['header = ' + json.dumps('Content-Type: application/json'), 'data = ' + json.dumps(json.dumps(data))]
    response = subprocess.run(['curl.exe', '-sS', '--max-time', '200', '-D', '-', '-K', '-'], input=('\n'.join(config)+'\n').encode(), capture_output=True)
    if response.returncode:
        raise RuntimeError('Website transport error, curl exit ' + str(response.returncode))
    headers, body = response.stdout.split(b'\r\n\r\n', 1)
    cookies = []
    for line in headers.decode().splitlines():
        if line.lower().startswith('set-cookie:'):
            cookies.append(line.split(':', 1)[1].strip().split(';')[0])
    result = json.loads(body)
    if isinstance(result, dict) and 'error' in result:
        raise RuntimeError(result['error'])
    return result, '; '.join(cookies)


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    status, cookie = call('status')
    if status['runtime']['interviewerVersion'] != '3.0.0':
        raise RuntimeError('Production slim runtime is not deployed')
    write(OUTPUT / 'status.json', status)
    source, _ = call('sessions/' + SOURCE, cookie=cookie)
    write(OUTPUT / 'source-public.json', source)
    config, _ = call('config', cookie=cookie)
    assert config['interviewer']['version'] == '3.0.0'
    jobs = [(group, point, repeat) for group in 'ABC' for point in (3, 6, 8, 9) for repeat in (1, 2, 3)]
    random.Random(20261104).shuffle(jobs)

    def sample(job):
        group, point, repeat = job
        key = f'{group}-{point}-{repeat}'
        started = time.monotonic()
        session, _ = call('sessions', {'mode': 'human', 'title': f'Fictional fixed-prefix test {key}', 'replay': {'sourceId': SOURCE, 'throughRound': point, 'variant': group}}, cookie)
        errors = []
        result = None
        for attempt in range(3):
            try:
                session, _ = call('sessions/' + session['id'] + '/step', {}, cookie)
                result = session['messages'][-1]
                break
            except Exception as error:
                errors.append(str(error))
                latest, _ = call('sessions/' + session['id'], cookie=cookie)
                if len(latest['messages']) == point * 2 + 1:
                    session, result = latest, latest['messages'][-1]
                    break
                if '上限' in str(error):
                    break
        record = {'key': key, 'group': group, 'point': point, 'repeat': repeat, 'sessionId': session['id'], 'elapsedSeconds': round(time.monotonic() - started, 2), 'errors': errors, 'output': result}
        write(OUTPUT / (key + '.json'), record)
        if result is None:
            try:
                call('sessions/' + session['id'] + '/finish', {}, cookie)
            except Exception:
                pass
        print(json.dumps({'key': key, 'ok': result is not None, 'chars': len(result['content']) if result else 0, 'errors': len(errors)}, ensure_ascii=True), flush=True)
        return record

    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(sample, job): job for job in jobs}
        for future in concurrent.futures.as_completed(futures):
            try:
                records.append(future.result())
            except Exception as error:
                group, point, repeat = futures[future]
                record = {'key': f'{group}-{point}-{repeat}', 'group': group, 'point': point, 'repeat': repeat, 'output': None, 'errors': [str(error)]}
                records.append(record)
                print(json.dumps({'key': record['key'], 'failed': str(error)}, ensure_ascii=True), flush=True)
            write(OUTPUT / 'results.json', records)

    blind = [r for r in records if r['output']]
    random.Random(731).shuffle(blind)
    key = []
    lines = ['# 精简采访者定点续写盲评', '', '评分：抓线索 0–2；增加理解 0–2；无未核前提 0–1；单问且简短 0–1。另记重复问题。', '', '先按编号评分，再看解盲文件。', '']
    for number, record in enumerate(blind, 1):
        label = f'Q{number:02d}'
        key.append({'label': label, 'key': record['key'], 'point': record['point']})
        lines += [f'## {label}（第 {record["point"]} 轮后）', '', record['output']['content'], '', '评分：__/6；备注：', '']
    (OUTPUT / 'blind-review.md').write_text('\n'.join(lines), encoding='utf-8')
    contexts = ['# 共同上文', '']
    for point in (3, 6, 8, 9):
        contexts += [f'## 截断点：第 {point} 轮后', '']
        for message in source['messages'][:point * 2]:
            contexts += [('问：' if message['actor'] == 'interviewer' else '答：') + message['content'], '']
    (OUTPUT / 'contexts.md').write_text('\n'.join(contexts), encoding='utf-8')
    write(OUTPUT / 'unblind-key.json', key)
    print(json.dumps({'completed': len(blind), 'planned': 36, 'output': str(OUTPUT)}, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()
