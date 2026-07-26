import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
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
import { startPendingOrderVerification } from './jobs/verifyPendingOrders.js';





dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.DASHBOARD_URL) {
  console.warn('[config] DASHBOARD_URL is not set — waiter scan links will point at the wrong host.');
}

const app =express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "https://app.carkhanaa.in",
  "https://dash.carkhanaa.in",
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

const limiter = rateLimit({
    max:1000,
    windowMs: 5*60*1000,
    message: {
        code:429,
        message:"Too Many Requests, Please Control Your Hunger."
    }
});

app.use(limiter);


app.use('/api/order', orderRouter);
app.use('/api/restaurant', restaurantRouter);
app.use('/api/menu', menuRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/support', supportRouter);
app.use('/api/category', categoryRouter);
app.use('/api/user', userRouter);
app.use('/api/waiter', waiterRouter);


app.get('/', async(req,res)=> res.send("Food Odering App"))

const PORT  = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(`server is running on port ${PORT}`))

startPendingOrderVerification();