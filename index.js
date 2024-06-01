const express = require('express')
// import { format } from 'date-fns'
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')

const port = process.env.PORT || 8000

// middleware
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://stayvista-ba29a.web.app',
  ],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster6.c5bm9qz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster6`
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    // Collections
    const roomsCollection = client.db('stayvista').collection('rooms')
    const usersCollection = client.db('stayvista').collection('users')

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      console.log('hello')
      const user = req.user
      const query = { email: user?.email }
      const result = await usersCollection.findOne(query)
      if (!result || result?.role !== 'admin')
        return res.status(401).send({ message: 'Unauthorized Access!!' })

      next()
    }

    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // Get all rooms
    app.get('/rooms', async (req, res) => {
      let query = {}
      const category = req?.query?.category
      if (category && category !== 'null') {
        query = { category: category }
      }
      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })

    // get all rooms for host account
    app.get('/my-listings/:email', async (req, res) => {
      const email = req.params.email

      let query = { 'host.email': email }

      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })

    // save a room data form database
    app.post('/room', async (req, res) => {
      const roomData = req.body
      const result = await roomsCollection.insertOne(roomData)
      res.send(result)
    })

    // Get single room data form db using _id
    app.get('/room/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await roomsCollection.findOne(query)
      res.send(result)
    })

    // save a user in db
    app.put('/user', async (req, res) => {
      const user = req.body
      const query = { email: user?.email }

      const isExist = await usersCollection.findOne(query)

      if (isExist) {
        if (user.status === 'Requested') {
          // existing user change his role
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          })
          return res.send(result)
        } else {
          // existing user login again
          return res.send(isExist)
        }
      }

      // save a user  for the first time
      const options = { upsert: true }
      const updatedDc = {
        $set: {
          ...user,
          timeStamp: format(Date.now(), 'EEE dd MMM, yyyy h:mm a'),
        },
      }
      const result = await usersCollection.updateOne(query, updatedDc, options)
      res.send(result)
    })

    // get a user info by email from db
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email })
      res.send(result)
    })

    // get all users from db
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    // Update user role
    app.patch('/users/update/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      const query = { email }
      const updatedDoc = {
        $set: {
          ...user,
          timeStamp: format(Date.now(), 'EEE dd MMM, yyyy h:mm a'),
        },
      }
      const result = await usersCollection.updateOne(query, updatedDoc)
      res.send(result)
    })

    // delete a room
    app.delete('/room/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await roomsCollection.deleteOne(query)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from StayVista Server..')
})

app.listen(port, () => {
  console.log(`StayVista is running on port ${port}`)
})
