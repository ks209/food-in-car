import jwt from 'jsonwebtoken';


const restaurantAuth = (req, res, next) => {
  console.log(req.cookies);
  const token = req.cookies?.token;
  console.log("Token:", token);
  if (!token) {
    return res.status(403).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "s3cret");
    req.restaurantId = decoded.id;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
};

export default restaurantAuth;              