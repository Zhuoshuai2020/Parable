import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const settings=sqliteTable('agent_settings',{owner:text('owner').primaryKey(),body:text('body').notNull()});
export const dailyUsage=sqliteTable('daily_usage',{day:text('day').primaryKey(),count:integer('count').notNull()});
export const sessions=sqliteTable('interview_sessions',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),body:text('body').notNull(),
 lockToken:text('lock_token'),lockUntil:integer('lock_until').notNull().default(0),
},table=>[index('sessions_owner').on(table.owner)]);
