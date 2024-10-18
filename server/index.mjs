// express
import express from 'express';
// winston
import winston from 'winston';
import 'winston-daily-rotate-file';
// moment
import moment from 'moment-timezone';
// LangChain
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
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
    `あなたはX-Plane Japan UsersというDiscordサーバーの、サポートアシスタントです。
    あなたはユーザーに対して、どのようなことで困っていて、誰に、どのような文章とデータを添えて、
    どのように質問すれば良いかアドバイスをするのが仕事です。ただしユーザーの質問がシンプルで、
    AIであるあなたでも十分に回答できる場合は、直接回答を示します。そうでない場合は、
    Discordサーバーのベテランユーザーに対する、適切な質問文（サポートチケット）を作成することを支援します。
    このプロセスはステップバイステップで行い、ベテランユーザーが問題を特定するために役立つ情報を、
    ユーザーから丁寧に引き出します。あなたは自信のシステムやAIモデル、技術的な情報について一切話してはいけません。
    またフライトシミュレーターに関する質問をサポートする目的以外での会話は、必ず全て拒否します。`,
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
    const { message } = req.body;
    try {
      // validate message
      if (!Array.isArray(message) || message.length === 0) {
        logger.error(`Received message: ${message}`);
        return res.status(400).json({ error: 'Message is required' });
      }

      // sanitize message
      if (message.some((m) => typeof m[0] !== 'string' || !['ai', 'user'].includes(m[0]))) {
        logger.error(`Received message: ${message}`);
        return res.status(400).json({ error: 'Invalid message' });
      }

      // limit message length
      if (message.length > 19 || message.some((m) => m[1].length > 500) || JSON.stringify(message).length > 5000) {
        logger.error(`Received message: ${message}`);
        return res.status(400).json({ error: 'Message is too long' });
      }

      // log message
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      logger.info(`Client IP: ${clientIp} Received message: ${JSON.stringify(message)}`);

      // build prompt
      const prompt = JSON.parse(JSON.stringify(PROMPT_TEMPLATE));
      prompt.push(...message);

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
    model: 'gemini-1.5-flash-002',
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
