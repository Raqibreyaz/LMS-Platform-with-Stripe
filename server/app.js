import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import Nodemailer from "nodemailer";
import cookieParser from "cookie-parser";
import { writeFile } from "node:fs/promises";

import courses from "./courses.json" with { type: "json" };
import checkoutSessions from "./checkoutSessions.json" with { type: "json" };
import sessions from "./sessions.json" with { type: "json" };
import otps from "./otps.json" with { type: "json" };

const CHECKOUT_SESSIONS_FILE = "./checkoutSessions.json";
const SESSIONS_FILE = "./sessions.json";
const OTPS_FILE = "./otps.json";

const stripeSecret = process.env.STRIPE_API_SECRET;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeWebhookIps = [
  "3.18.12.63",
  "3.69.109.8",
  "3.120.168.93",
  "3.130.192.231",
  "13.235.14.237",
  "13.235.122.149",
  "18.211.135.69",
  "35.154.171.200",
  "35.157.207.129",
  "52.15.183.38",
  "54.88.130.119",
  "54.88.130.237",
  "54.187.174.169",
  "54.187.205.235",
  "54.187.216.72",
];

// Create a transporter using SMTP
const transporter = Nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // use STARTTLS (upgrade connection to TLS after connecting)
  auth: {
    user: process.env.NODEMAILER_USER_EMAIL,
    pass: process.env.NODEMAILER_USER_PASS,
  },
});

const stripeClient = new Stripe(stripeSecret);

const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.post(
  "/hello-world",
  (req, res, next) => {
    // ngrok wraps the ip so take the original ip
    const stripeIp = req.headers["x-forwarded-for"] || "random_string";

    if (!stripeWebhookIps.includes(stripeIp)) {
      console.log("returning as ip didnt match!");
      return res
        .status(400)
        .json({ error: "You are not allowed to request here!" });
    }

    next();
  },
  express.raw({ type: "application/json" }),
  async (req, res, next) => {
    console.log(req.socket.remoteAddress);
    console.log(req.ip);

    let event = null;
    // signature verification, so that we only allow stripe
    try {
      const webhookSignature = req.headers["stripe-signature"];
      event = await stripeClient.webhooks.constructEventAsync(
        req.body,
        webhookSignature,
        stripeWebhookSecret,
      );
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: "Invalid Signature!" });
    }

    const paymentStatus = event.data?.object.payment_status;
    const checkoutSessionId = event.data?.object?.id;
    const customerEmail = event.data.object.customer_email;

    if (paymentStatus === "paid") {
      checkoutSessions.push({
        checkoutSessionId,
        courses: [],
        paymentStatus,
        updatedByWebhook: true,
        userEmail: customerEmail,
      });

      await writeFile(
        CHECKOUT_SESSIONS_FILE,
        JSON.stringify(checkoutSessions, null, 2),
      );
    }

    res.json({ message: "hello stripe!" });
  },
);

app.use(express.json());
app.use(cookieParser());

// throttling requests to avoid race condition
app.use((req, res, next) => {
  setTimeout(() => next(), 3 * 1000);
});

// session middleware
app.use(async (req, res, next) => {
  // add session if not exists
  if (!req.cookies.session) {
    const ip = req.socket.remoteAddress;
    // use if session already exist for that ip else generate new
    let session = sessions.find((session) => session.ip === ip);

    if (!session) {
      session = {
        cart: [],
        id: crypto.randomUUID(),
        ip: req.socket.remoteAddress,
        userEmail: null,
        userMobile: null,
        userName: null,
        purchasedCourses: [],
      };

      sessions.push(session);
      await writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    }

    // send a cookie in response
    req.cookies.session = session.id;
    res.cookie("session", session.id, {
      httpOnly: true,
      maxAge: 86400 * 1000,
    });
  }
  next();
});

app.get("/me", (req, res, next) => {
  const sessionId = req.cookies.session;

  const session = { ...sessions.find((session) => session.id === sessionId) };

  res.json({ session });
});

// get all available courses
app.get("/courses", (req, res) => {
  res.json(courses);
});

// add course to cart
app.post("/cart/:courseId", async (req, res, next) => {
  const courseId = req.params.courseId;
  const session = sessions.find(
    (session) => session.id === req.cookies.session,
  );

  // course might not exist
  if (courses.findIndex((course) => course.id === courseId) === -1)
    return res.status(400).json({ error: "Invalid course id!" });

  // course might already been purchased
  if (session.purchasedCourses.indexOf(courseId) !== -1)
    return res.status(400).json({ error: "course already purchased!" });

  // course might already added to cart
  if (session.cart.indexOf(courseId) !== -1)
    return res.status(400).json({ error: "course already added to cart!" });

  session.cart.push(courseId);
  await writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));

  res.json({ message: "course added to cart!" });
});

// remove course from cart
app.delete("/cart/:courseId", async (req, res, next) => {
  const courseId = req.params.courseId;
  const session = sessions.find(
    (session) => session.id === req.cookies.session,
  );

  // course might not present in cart
  const courseIndex = session.cart.indexOf(courseId);
  if (courseIndex === -1)
    return res.status(400).json({ error: "course not present in cart!" });

  session.cart.splice(courseIndex, 1);
  await writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));

  res.json({ message: "course added to cart!" });
});

app.post("/send-otp", async (req, res, next) => {
  const email = req.body?.email;
  if (!email) return res.status(400).json({ error: "email is required!" });

  // send 6-digit otp to the given email
  const otp = crypto.randomInt(100000, 999999);

  otps.push({ otp, email, sentAt: Date.now() });
  await writeFile(OTPS_FILE, JSON.stringify(otps, null, 2));

  const html = `
    <div style="font-family:sans-serif;">
      <h2>Your OTP is: ${otp}</h2>
      <p>This OTP is valid for 10 minutes.</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"LMS Team" <${process.env.NODEMAILER_USER_EMAIL}>`,
      to: email,
      subject: "Email Verification OTP",
      html,
    });

    console.log("Message sent: %s", info.messageId);
    return res.json({ message: "otp sent successfully!" });
  } catch (err) {
    console.error("Error while sending mail:", err);
    return res.status(500).json({ error: err });
  }
});

app.put("/update-contact-info", async (req, res, next) => {
  const sessionId = req.cookies.session;
  let otp = req.body?.otp;
  const mobile = req.body?.mobile;
  const userName = req.body?.name;

  // otp can be of some other type or not of 6 digits
  if (typeof otp !== "string" || isNaN(otp) || otp.length !== 6)
    return res.status(400).json({ error: "Invalid OTP!" });
  otp = parseInt(otp);

  if (
    !mobile ||
    !userName ||
    typeof mobile !== "string" ||
    typeof userName !== "string" ||
    mobile.length !== 10
  )
    return res.status(400).json({
      error:
        "mobile and name both are required and must be string + mobile should be 10-digit!",
    });

  // otp might not exist
  const otpIndex = otps.findIndex((savedOtp) => savedOtp.otp === otp);
  if (otpIndex === -1) return res.status(400).json({ error: "Invalid OTP!" });

  const savedOtp = otps[otpIndex];
  otps.splice(otpIndex, 1);
  await writeFile(OTPS_FILE, JSON.stringify(otps, null, 2));

  // otp might be expired
  const timePassedInMins = Math.round(
    (Date.now() - savedOtp.sentAt) / (1000 * 60),
  );
  if (timePassedInMins > 10)
    return res.status(400).json({ error: "OTP expired!" });

  // update session DB
  const session = sessions.find((session) => session.id === sessionId);
  session.userEmail = savedOtp.email;
  session.userMobile = mobile;
  session.userName = userName;

  // find all the purchased courses of the user
  session.purchasedCourses = checkoutSessions
    .filter((checkoutSession) => checkoutSession.userEmail === savedOtp.email)
    .reduce(
      (prevArr, checkoutSession) => [...prevArr, ...checkoutSession.courses],
      [],
    );

  // filter out courses which are already purchased
  session.cart = session.cart.filter(
    (courseId) => !session.purchasedCourses.includes(courseId),
  );

  await writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));

  res.json({ message: "Contact Info Updated!" });
});

app.post("/create-checkout", async (req, res) => {
  const sessionId = req.cookies.session;

  const session = sessions.find((session) => session.id === sessionId);

  // mobile and email must exist for payment
  if (!session.userEmail || !session.userMobile || !session.userName)
    return res
      .status(400)
      .json({ error: "Email and Mobile both must be available!" });

  // throw when course(s) are purchased already
  const alreadyPurchased = session.cart.find((courseId) =>
    session.purchasedCourses.includes(courseId),
  );
  if (alreadyPurchased)
    return res
      .status(400)
      .json({ error: "Remove already purchased courses from cart!" });

  // find all the courses present in cart
  const cartCourses = courses.filter((course) =>
    session.cart.includes(course.id),
  );

  try {
    const checkoutSession = await stripeClient.checkout.sessions.create({
      return_url:
        "http://localhost:5173/return?session_id={CHECKOUT_SESSION_ID}",
      customer_email: session.userEmail,
      shipping_address_collection: {
        allowed_countries: ["IN", "PK", "BD", "NP"],
      },
      metadata: {
        userName: session.userName,
        userContact: session.userMobile,
        noOfCourses: cartCourses.length,
      },
      line_items: cartCourses.map((course) => ({
        quantity: 1,
        price_data: {
          currency: "USD",
          unit_amount: course.price * 100,
          product_data: {
            name: course.name,
            images: [course.image],
          },
        },
      })),
      mode: "payment",
      ui_mode: "embedded_page",
    });

    res.json({ clientSecret: checkoutSession.client_secret });
  } catch (error) {
    console.error("Stripe Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/complete-checkout/:checkoutSessionId", async (req, res) => {
  const sessionId = req.cookies.session;
  const session = sessions.find((session) => session.id === sessionId);

  const checkoutSessionId = req.params.checkoutSessionId;
  const checkoutSession =
    await stripeClient.checkout.sessions.retrieve(checkoutSessionId);

  if (!checkoutSession) {
    return res.status(404).json({ error: "Invalid checkout session id" });
  }

  if (checkoutSession.payment_status === "paid") {
    let checkoutSession = checkoutSessions.find(
      (checkoutSession) =>
        checkoutSession.checkoutSessionId === checkoutSessionId,
    );

    // create a checkout session object if not exist yet
    if (!checkoutSession)
      checkoutSession = {
        checkoutSessionId: checkoutSessionId,
        paymentStatus: "paid",
      };

    // update necessary fields
    checkoutSession.courses = [
      ...(checkoutSession.courses ?? []),
      ...session.cart,
    ];
    // checkoutSession.userEmail = session.userEmail;
    checkoutSession.updatedByFrontend = true;

    // update the in-memory array
    if (!checkoutSession) checkoutSessions.push(checkoutSession);

    // write to DB
    await writeFile(
      CHECKOUT_SESSIONS_FILE,
      JSON.stringify(checkoutSessions, null, 2),
    );

    session.purchasedCourses = [...session.purchasedCourses, ...session.cart];
    session.cart = [];
    await writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));

    return res.json({
      message: "Checkout Completed",
      status: checkoutSession.status,
    });
  }
  res
    .status(400)
    .json({ error: "Checkout not completed", status: checkoutSession.status });
});

app.listen(8080, (error) => {
  if (error) return console.log(error);

  console.log("Server started");
});
/*

stripe called this webhook: {
  id: 'evt_1TNWa4FHDoQVaRBKbYnTBMT5',
  object: 'event',
  api_version: '2026-03-25.dahlia',
  created: 1776509912,
  data: {
    object: {
      id: 'cs_test_a1iP4B8q5cceNOkpSMb3z7TqUdug2ub5UC6OHw6uX7QwHruwK4JkwuzsWN',
      object: 'checkout.session',
      adaptive_pricing: [Object],
      after_expiration: null,
      allow_promotion_codes: null,
      amount_subtotal: 299900,
      amount_total: 299900,
      automatic_tax: [Object],
      billing_address_collection: null,
      branding_settings: [Object],
      cancel_url: null,
      client_reference_id: null,
      client_secret: null,
      collected_information: [Object],
      consent: null,
      consent_collection: null,
      created: 1776509891,
      currency: 'usd',
      currency_conversion: null,
      custom_fields: [],
      custom_text: [Object],
      customer: null,
      customer_account: null,
      customer_creation: 'if_required',
      customer_details: [Object],
      customer_email: 'raquib@raquib.com',
      discounts: [],
      expires_at: 1776596291,
      integration_identifier: null,
      invoice: null,
      invoice_creation: [Object],
      livemode: false,
      locale: null,
      managed_payments: [Object],
      metadata: [Object],
      mode: 'payment',
      origin_context: null,
      payment_intent: 'pi_3TNWa2FHDoQVaRBK0X7O2jCe',
      payment_link: null,
      payment_method_collection: 'if_required',
      payment_method_configuration_details: [Object],
      payment_method_options: [Object],
      payment_method_types: [Array],
      payment_status: 'paid',
      permissions: null,
      phone_number_collection: [Object],
      presentment_details: [Object],
      recovered_from: null,
      redirect_on_completion: 'always',
      return_url: 'http://localhost:5173/return?session_id={CHECKOUT_SESSION_ID}',
      saved_payment_method_options: null,
      setup_intent: null,
      shipping_address_collection: [Object],
      shipping_cost: null,
      shipping_options: [],
      status: 'complete',
      submit_type: null,
      subscription: null,
      success_url: null,
      total_details: [Object],
      ui_mode: 'embedded_page',
      url: null,
      wallet_options: null
    }
  },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  type: 'checkout.session.completed'
}

*/
