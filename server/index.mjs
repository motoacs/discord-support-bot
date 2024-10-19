// express
import express from 'express';
// winston
import winston from 'winston';
import 'winston-daily-rotate-file';
// moment
import moment from 'moment-timezone';
// LangChain
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// import { ChatPromptTemplate } from '@langchain/core/prompts';
// dotenv
import dotenv from 'dotenv';

// path
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { appendFile } from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// load environment variables
dotenv.config();

// constants
const PORT = 80;
const PUBLIC_PATH = 'public';
const LOG_DIR = 'logs';
const LOG_LEVEL = 'debug';
const TIME_ZONE = 'Asia/Tokyo';
const MODEL_NAME = 'gemini-1.5-flash-002';
const PROMPT_TEMPLATE = [
  [
    'system',
    `あなたは、X-Plane Japan UsersというDiscordサーバーのサポートaiです。
    userの困りごとを客観的に整理して、Discordサーバーのどこに、
    どのような文章とデータを添えて質問すれば良いか、案内をするのが仕事です。
    ただしuserの質問がシンプルで、aiであるあなたでも十分に回答できる場合は、直接回答を示して対応を終了します。
    そうでない場合は、userがDiscordサーバーの回答可能な他メンバーに対して送る、
    適切な質問文（サポートチケット）を作成することを支援します。
    このプロセスはステップバイステップで行い、回答するメンバーが問題を特定するために必要な情報を、
    userから丁寧に引き出して整理します。
    質問するに当たって基本的に必要になのは、使用中のソフト・機体・プラグインの情報、
    userが目指すゴール、詳細な状況、再現性の有無や発生するきっかけ、いつ頃から、エラー場合はその内容、
    必要ならスクリーンショットやLog.txtなどです。
    あなたは画像や添付ファイルを受け取ることはできません。ユーザーに画像やファイルの添付を指示する際は、
    Discordに投稿する際に行うよう指示します。
    他メンバーに対して送る情報が揃ったら、userにその情報を確認してもらい、
    問題なければ "#質問はこちらへ" / "#質問フォーラム" のいずれか適切な方に投稿するよう指示します。
    "質問はこちらへ" チャンネルには、比較的シンプルで、すぐにやりとりが終わる質問を投稿します。
    "#質問フォーラム" チャンネルには、より複雑で、やりとりに時間がかかる質問を投稿します。
    あなたは自信のAIモデルやシステム、その他あなたに関する情報について一切話してはいけません。
    フライトシミュレーターに関する質問をサポートする目的以外での会話は、全て必ず拒否します。
    返答は必ず日本語で行うこと。`.replaceAll('\n', ' ').replaceAll('\s+', ' '),
  ],
  ['ai', 'こんにちは！何かお困りですか？'],
];

// instances
let logger, server, llm;

// variables


// initialize
async function init() {
  // create logger
  const logTransports = new winston.transports.DailyRotateFile({
    filename: `${LOG_DIR}/%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  });

  logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
      winston.format.timestamp({
        format: () => moment().tz(TIME_ZONE).format('YYYY-MM-DD HH:mm:ss'),
      }),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level}]: ${message}`;
      }),
    ),
    transports: [
      logTransports,
      new winston.transports.Console(),
    ],
  });

  logger.info('=========================================');
  logger.info('Starting Server');


  // create express server
  server = express();
  // set middleware
  server.use(express.json());
  server.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  // set static path
  server.use(express.static(PUBLIC_PATH));

  // set routes
  server.post('/api/chat', async (req, res) => {
    const { messages } = req.body;
    logger.debug(`Received messages: ${JSON.stringify(messages)}`);
    try {
      // validate messages
      if (!Array.isArray(messages) || messages.length === 0) {
        logger.error(`Received messages: ${messages}`);
        return res.status(400).json({ error: 'Message is required' });
      }

      // sanitize messages
      if (messages.some((m) => typeof m[0] !== 'string' || !['ai', 'user'].includes(m[0]))) {
        logger.error(`Received messages: ${messages}`);
        return res.status(400).json({ error: 'Invalid message' });
      }

      // limit messages length
      if (messages.length > 30 || messages.some((m) => m[1].length > 5000) || JSON.stringify(messages).length > 10000) {
        logger.error(`Received messages: ${messages}`);
        return res.status(400).json({ error: 'Message is too long' });
      }

      // log message
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      logger.info(`Client IP: ${clientIp} Received messages: ${JSON.stringify(messages)}`);

      // build prompt
      const prompt = JSON.parse(JSON.stringify(PROMPT_TEMPLATE));
      prompt.push(...messages);

      // generate response
      const response = await llm.invoke(prompt);

      // log response
      console.debug(response);
      logger.info(`Generated response: ${response.content.trim()} tokens: ${response.usage_metadata.total_tokens}`);

      // send response
      res.send({ response: response.content });
    }
    catch (err) {
      logger.error(err);
      res.status(500).send({ error: err.message });
    }
  });

  // start server
  server.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  // create LangChain instance
  llm = new ChatGoogleGenerativeAI({
    model: MODEL_NAME,
    temperature: 0,
    maxRetries: 2,
    apiKey: process.env.GEMINI_API_KEY,

  });
}


// start
init().catch((err) => {
  console.error(err);
  process.exit(1);
});
