import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';



dotenv.config();

const app =express();

app.use(express.json());

app.use(morgan("combined"));

const limiter = rateLimit({
    max:100,
    windowMs: 5*60*1000,
    message: {
        code:429,
        message:"Too Many Requests, Please Control Your Hunger."
    }
});

app.use(limiter);


app.use('/api/order', orderRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/payment', paymentRoutes);


app.get('/', async(req,res)=> res.send("Food Odering App"))

const PORT  = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(`server is running on port ${PORT}`))