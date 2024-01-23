require('dotenv').config()
const express = require("express")
const jwt = require("jsonwebtoken")
const cors = require("cors")
const app = express()
const bcrypt = require('bcryptjs');
const cookieParser = require("cookie-parser")
const port = process.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');



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



const varifyToken = (req, res, next) => {
    const token = req.cookies.token
    if (!token) {
        return res.send({})
    }
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decode) => {
        if (err) {
            return res.status(403).send({ message: "unauthorized access" })

        }
        req.USER = decode
        next()
    })
}



// collections 

const userCollection = client.db("HouseHunter").collection("user")
const roomsCollection = client.db("HouseHunter").collection("rooms")
const renterDetailsCollection = client.db("HouseHunter").collection("renterDetails")

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });


        const varifyOwner = async (req, res, next) => {
            const { email } = req.USER || {}
            if (!email) {
                return res.status(401).send({ message: "unauthorized access" })
            }

            const projection = { _id: 0, role: 1 }
            const { role } = await userCollection.findOne({ email: email }, { projection })
            if (!role) {
                return res.status(401).send({ message: "unauthorized access" })
            }

            if (role !== "House Owner") {
                return res.status(403).send({ message: "Forbiden access" })

            }
            next()


        }

        // --------Auth related Api -------

        // auth token
        app.post("/api/token", async (req, res) => {
            const userData = req.body
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
            const { email, password, role, name, phoneNumber } = req.body

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
                phoneNumber,
                password: hashedPassword,
                role,
                bookedRoom: []

            }


            const result = await userCollection.insertOne(userObj)
            res.send(result)
        })


        // log in
        app.post("/api/login", async (req, res) => {
            const { email, password } = req.body
            if (!email || !password) {
                return
            }

            const user = await userCollection.findOne({ email: email })
            if (!user) {
                return res.send({ found: false })
            }
            const mathed = await bcrypt.compare(password, user?.password)
            if (!mathed) {
                return res.send({ mathed: false })
            }

            res.send(user)
        })
        // logout
        app.post("/api/logout", async (req, res) => {
            res.clearCookie("token", { maxAge: 0 }).send({ message: "cookie removed" })
        })


        // get user onAuthchange
        app.get("/api/authChange", varifyToken, async (req, res) => {
            const { email, password } = req.USER || {}

            const user = await userCollection.findOne({ email: email })
            if (!user) {
                return res.status(403).send({ message: "unauthorized access" })
            }
            const mathed = await bcrypt.compare(password, user?.password)
            if (!mathed) {
                return res.status(403).send({ message: "unauthorized access" })
            }
            res.send(user)
        })


        // ---------- rooms related api ----------
        app.get("/api/all/rooms", async (req, res) => {
            const { city, bedrooms, bathrooms, room_size, availability, price_range, search, currentPage = 0 } = req.query
            const minPrice = parseInt(price_range?.split("@")[0])
            const maxPrice = parseInt(price_range?.split("@")[1])



            let find = { isAvailable: true }
            const skip = parseInt(currentPage) * 10


            if (city) {
                let replica = { ...find, city: new RegExp(city, "i") }
                find = replica

            }

            if (bedrooms) {
                let replica = { ...find, bedrooms: parseInt(bedrooms) }
                find = replica
            }
            if (bathrooms) {
                let replica = { ...find, bathrooms: parseInt(bathrooms) }
                find = replica
            }

            if (room_size) {
                let replica = {
                    ...find,
                    room_size: { $gte: parseInt(room_size) }
                }

                find = replica
            }

            if (availability) {
                let replica = {
                    ...find,
                    availability: availability
                }

                find = replica
            }

            if (price_range) {
                let replica = {
                    ...find,
                    rent_per_month: {
                        $gte: minPrice,
                        $lte: maxPrice
                    }
                }

                find = replica
            }


            if (search) {
                let replica = {
                    ...find,
                    name: new RegExp(search, "i")
                }
                find = replica


            }

            const result = await roomsCollection.find(find).skip(skip).limit(10).toArray()
            const totalData = (await roomsCollection.find(find).toArray()).length
            res.send([result, totalData])

        })


        // room booking
        app.post("/api/room/book", varifyToken, async (req, res) => {
            const { email } = req.USER
            const { room_id } = req.query
            const { body } = req
            const updateUserBooking = {
                $push: {
                    bookedRoom: room_id
                }
            }

            const { bookedRoom } = await userCollection.findOne({ email: email })

            if (bookedRoom.length === 2) {
                return res.send({ limit: true })
            }

            const addToBooked = await userCollection.updateOne({ email: email }, updateUserBooking)

            const insertRenter = await renterDetailsCollection.insertOne(body)

            const result = await roomsCollection.updateOne({
                _id: new ObjectId(room_id)
            },
                {
                    $set: {

                        isAvailable: false
                    }
                }
            )

            res.send(result)
        })


        // RENTER BOOKINGs
        app.post("/api/bookings", varifyToken, async (req, res) => {
            const { ids } = req.body

            const objectIds = ids.map(id => new ObjectId(id))
            const find = {
                _id: { $in: objectIds }
            }

            console.log(objectIds);

            const result = await roomsCollection.find(find).toArray()
            res.send(result)
        })


        // cancel booking
        app.delete("/api/cancelBooking", varifyToken, async (req, res) => {
            const { id } = req.query
            const { email } = req.USER
            const makeAvailable = await roomsCollection.updateOne({
                _id: new ObjectId(id)
            },
                {
                    $set: {
                        isAvailable: true
                    }
                })

            const removeLimit = await userCollection.updateOne({
                email: email
            }, {
                $pull: {
                    bookedRoom: id
                }
            })

            const deleteRenterDetails = await renterDetailsCollection.deleteOne({
                room_id: id
            })
            res.send(deleteRenterDetails)
        })

        // addd rooom
        app.post("/api/add_room", varifyToken, varifyOwner, async (req, res) => {
            const { body } = req
            const result = await roomsCollection.insertOne(body)
            res.send(result)
        })

        // get owners created room
        app.get("/api/owner_rooms", varifyToken, varifyOwner, async (req, res) => {
            const { email } = req.USER
            const { isActive } = req.query
            let find = { ownedBy: email }
            const acitveBoolen = Boolean(isActive)
            if (acitveBoolen) {
                const replica = {
                    ...find,
                    isActive: isActive
                }
                find = replica
            }
            const result = await roomsCollection.find(find).toArray()
            res.send(result)
        })


        // update room 
        app.put("/api/room_update", varifyToken, varifyOwner, async (req, res) => {
            const { id } = req.query
            const { name, city, bedrooms, bathrooms, room_size, availability, rent_per_month, description, address } = req.body
            const update = {
                $set: {
                    name: name, city: city, bedrooms: bedrooms, bathrooms: bathrooms, room_size: room_size, availability: availability, rent_per_month: rent_per_month, description: description, address: address
                }
            }

            const find = { _id: new ObjectId(id) }
            const result = await roomsCollection.updateOne(find, update)
            res.send(result)
        })


        // delete room
        app.delete("/api/room_delete", varifyToken, varifyOwner, async (req, res) => {
            const { id } = req.query
            const find = { _id: new ObjectId(id) }
            const result = await roomsCollection.deleteOne(find)
            res.send(result)
        })


        // room detail
        app.get("/api/room/:id", varifyToken, async (req, res) => {
            const { id } = req.params
            const find = { _id: new ObjectId(id) }
            const result = await roomsCollection.findOne(find)
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