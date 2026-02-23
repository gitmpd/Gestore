import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import os from 'os';
import { authRouter } from './routes/auth';
import { categoriesRouter } from './routes/categories';
import { productsRouter } from './routes/products';
import { customersRouter } from './routes/customers';
import { suppliersRouter } from './routes/suppliers';
import { salesRouter } from './routes/sales';
import { syncRouter } from './routes/sync';
import { reportsRouter } from './routes/reports';
import { auditRouter } from './routes/audit';
import { backupRouter } from './routes/backup';
import { errorHandler } from './middleware/errorHandler';
import { adminRouter } from "./routes/admin";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function isPrivateNetworkHost(hostname: string): boolean {
  const parts = hostname.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  return (
    parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
  );
}

function isAllowedOrigin(origin: string): boolean {
  if (configuredOrigins.length > 0) {
    return configuredOrigins.includes(origin);
  }

  try {
    const url = new URL(origin);
    const host = url.hostname;
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || isPrivateNetworkHost(host);
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin non autorisee par CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Trop de requêtes. Réessayez dans un instant.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/auth/login',
});

app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/sales', salesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/backup', backupRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/discovery', (_req, res) => {
  const interfaces = os.networkInterfaces();
  const virtualPrefixes = ['docker', 'br-', 'veth', 'virbr', 'tun', 'tap'];
  const addresses: { ip: string; subnet: string; name: string }[] = [];

  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    const isVirtual = virtualPrefixes.some((p) => name.toLowerCase().startsWith(p));
    if (isVirtual) continue;
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal && info.netmask) {
        const ipParts = info.address.split('.');
        const maskParts = info.netmask.split('.');
        const subnet = ipParts.map((p, i) => (Number(p) & Number(maskParts[i])).toString()).join('.');
        addresses.push({ ip: info.address, subnet, name });
      }
    }
  }

  res.json({
    app: 'GestionStore',
    version: '1.0',
    port: Number(PORT),
    addresses,
  });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
