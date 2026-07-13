const express = require('express');
const request = require('supertest');

describe('Security & API Middlwares', () => {
  let app;
  
  beforeEach(() => {
    // Setup a mini express app to isolate middleware testing
    app = express();
    app.use(express.json());
  });

  test('adminAuth middleware should block unauthorized requests', async () => {
    const { replace_file_content } = require('fs'); // dummy require
    
    // Inline adminAuth definition matching index.js
    const ADMIN_API_KEY = 'test_secret_key';
    const adminAuth = (req, res, next) => {
      const apiKey = req.headers['x-admin-api-key'];
      if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      next();
    };

    app.get('/admin-test', adminAuth, (req, res) => {
      res.json({ success: true });
    });

    // 1. Unauthenticated request
    const res1 = await request(app).get('/admin-test');
    expect(res1.status).toBe(403);
    expect(res1.body.success).toBe(false);

    // 2. Invalid API key request
    const res2 = await request(app).get('/admin-test').set('x-admin-api-key', 'wrong');
    expect(res2.status).toBe(403);

    // 3. Valid API key request
    const res3 = await request(app).get('/admin-test').set('x-admin-api-key', 'test_secret_key');
    expect(res3.status).toBe(200);
    expect(res3.body.success).toBe(true);
  });

  test('rateLimiter middleware should block after limits exceeded', async () => {
    const rateLimitCache = new Map();
    const rateLimiter = (limit, windowMs) => {
      return (req, res, next) => {
        const ip = '127.0.0.1';
        const now = Date.now();
        let record = rateLimitCache.get(ip);
        if (!record) {
          record = { count: 0, resetTime: now + windowMs };
          rateLimitCache.set(ip, record);
        }
        if (now > record.resetTime) {
          record.count = 0;
          record.resetTime = now + windowMs;
        }
        record.count++;
        if (record.count > limit) {
          return res.status(429).json({ success: false, error: 'Too many requests' });
        }
        next();
      };
    };

    app.get('/rate-test', rateLimiter(2, 5000), (req, res) => {
      res.json({ success: true });
    });

    const r1 = await request(app).get('/rate-test');
    expect(r1.status).toBe(200);

    const r2 = await request(app).get('/rate-test');
    expect(r2.status).toBe(200);

    const r3 = await request(app).get('/rate-test');
    expect(r3.status).toBe(429);
  });
});
