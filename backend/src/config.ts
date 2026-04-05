import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATASAHAM_API_KEY) {
  throw new Error('DATASAHAM_API_KEY environment variable is required');
}

export const config = {
  datasahamApiKey: process.env.DATASAHAM_API_KEY,
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping',
} as const;
