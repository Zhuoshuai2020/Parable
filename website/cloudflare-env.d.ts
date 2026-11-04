declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PARABLE_API_BASE?: string;
    PARABLE_MODEL?: string;
    PARABLE_API_KEY?: string;
    PARABLE_DAILY_LIMIT?: string;
  }
}
