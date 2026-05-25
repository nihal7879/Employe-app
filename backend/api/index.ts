import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express, Request, Response } from 'express';
// Import the COMPILED module (dist) — tsc emits the decorator metadata Nest's DI
// needs. Importing from ../src would let Vercel's esbuild strip that metadata and
// break dependency injection. Run `nest build` before deploy (Vercel runs it via
// the "build" script).
import { AppModule } from '../dist/app.module';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');

let cached: Express | null = null;

async function bootstrap(): Promise<Express> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.set('trust proxy', true);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init(); // init(), NOT listen() — Vercel owns the HTTP server
  return expressApp;
}

// Reuse the booted app across invocations on a warm Lambda.
export default async function handler(req: Request, res: Response) {
  if (!cached) cached = await bootstrap();
  cached(req, res);
}
