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





dotenv.config();

const app =express();

app.use(cors({   origin: "http://localhost:3000", credentials: true}));
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


app.get('/', async(req,res)=> res.send("Food Odering App"))

const PORT  = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(`server is running on port ${PORT}`))