import mongoose from "mongoose"
import dotenv from "dotenv"
dotenv.config()

 const connectDB=async(req,res)=>{
try {
    const connectDB=await mongoose.connect(process.env.MONGO_URI)
    console.log("MongoDb connected")
} catch (error) {
    console.error("Connecting error in MongoDB")
    process.exit(1)
}
}

export default connectDB