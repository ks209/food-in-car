import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import orderRouter from './routes/order/order.js';
import restaurantRouter from './routes/restaurant/restaurant.js';
import menuRouter from './routes/menu/menu.js';
import paymentRouter from './routes/payment/payment.js'
import supportRouter from './routes/support/support.js';
import categoryRouter from './routes/menu/category.js';
import userRouter from './routes/user/user.js';
import waiterRouter from './routes/waiter/waiter.js';
import cityRouter from './routes/city/city.js';
import configRouter from './routes/config/config.js';
import analyticsRouter from './routes/analytics/analytics.js';
import parkingRouter from './routes/parking/parking.js';
import waiterAppRouter from './routes/waiterApp/waiterApp.js';
import venueRouter from './routes/venue/venue.js';
import { startPendingOrderVerification } from './jobs/verifyPendingOrders.js';





dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.DASHBOARD_URL) {
  console.warn('[config] DASHBOARD_URL is not set — waiter scan links will point at the wrong host.');
}

const app =express();

// Behind one HTTPS reverse proxy: take the client IP from X-Forwarded-For so
// the login rate limiters count per customer, not per proxy.
app.set('trust proxy', 1);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://app.carkhanaa.in",
  "https://dash.carkhanaa.in",
  "https://admin.carkhanaa.in",
  "https://food-in-car-three.vercel.app"
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json());

app.use(morgan("combined"));

app.use(cookieParser());

// No global rate limiter. The old one (1000 requests / 5 min per IP) was
// shared by every customer behind the HTTPS proxy (no trust proxy set, so all
// requests came from the proxy's IP) and the 2-second polling of the order
// status page, dashboard and waiter app would have exhausted it with a handful
// of users. Brute-force protection lives on the login routes only — see
// middlewares/loginLimiter.js.


app.use('/api/order', orderRouter);
app.use('/api/restaurant', restaurantRouter);
app.use('/api/menu', menuRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/support', supportRouter);
app.use('/api/category', categoryRouter);
app.use('/api/user', userRouter);
app.use('/api/waiter', waiterRouter);
app.use('/api/city', cityRouter);
app.use('/api/config', configRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/parking', parkingRouter);
app.use('/api/waiter-app', waiterAppRouter);
app.use('/api/venue', venueRouter);


app.get('/', async(req,res)=> res.send("Food Odering App"))

const PORT  = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(`server is running on port ${PORT}`))

startPendingOrderVerification();