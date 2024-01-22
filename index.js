require('dotenv').config()
const express = require("express")
const jwt = require("jsonwebtoken")
const cors = require("cors")
const app = express()
const bcrypt = require('bcryptjs');
const cookieParser = require("cookie-parser")
const port = process.PORT || 5000
const { MongoClient, ServerApiVersion } = require('mongodb');



app.use(express.json())
app.use(cors({
    origin: ["http://localhost:5173"],
    credentials: true
}))

app.use(cookieParser())


const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.xbiw867.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


// collections 

const userCollection = client.db("HouseHunter").collection("user")

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });

        // auth token
        app.post("/api/token", async (req, res) => {
            const userData = req.body
            console.log(userData);
            const yearInSecond = 365 * 24 * 60 * 60 //365 day in second
            const expireDate = new Date(Date.now() + yearInSecond * 1000)

            const token = jwt.sign(userData, process.env.ACCESS_TOKEN, { expiresIn: "365d" })

            res.cookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
                expires: expireDate
            }).send({ success: true });

        })

        app.post("/api/register", async (req, res) => {
            const { email, password, role, name } = req.body
            console.log(req.body);

            if (!req.body) {
                return
            }

            const find = { email: email }
            const isExist = await userCollection.findOne(find)


            if (isExist) {
                return res.send({ isExist: true })
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const userObj = {
                name,
                email,
                password: hashedPassword,
                role

            }


            const result = await userCollection.insertOne(userObj)
            res.send(result)
        })




    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send("hello server")
})






app.listen(port)