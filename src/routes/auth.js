import express from "express";
import { signUp, logIn, getUserFromSession, logOut } from "../services/userAuthService.js";

export const authRouter = express.Router();

function validateSignup(body) {
  const errors = [];
  if (!body.name || body.name.trim().length < 2) errors.push("name is required (min 2 characters)");
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) errors.push("a valid email is required");
  if (!body.password || body.password.length < 8) errors.push("password must be at least 8 characters");
  if (body.password !== body.confirmPassword) errors.push("passwords do not match");
  return errors;
}

authRouter.post("/signup", async (req, res) => {
  const errors = validateSignup(req.body);
  if (errors.length > 0) return res.status(400).json({ error: "Validation failed", details: errors });

  try {
    const { user, token } = await signUp(req.body);
    res.status(201).json({ ...user, token });
  } catch (err) {
    if (err.message?.includes("unique")) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    console.error("Signup failed:", err);
    res.status(500).json({ error: "Signup failed", detail: err.message });
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  try {
    const { user, token } = await logIn({ email, password });
    res.json({ ...user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

authRouter.get("/me", async (req, res) => {
  const token = req.headers["x-session-token"];
  if (!token) return res.status(401).json({ error: "No session token provided" });

  const user = await getUserFromSession(token);
  if (!user) return res.status(401).json({ error: "Invalid or expired session" });

  res.json(user);
});

authRouter.post("/logout", async (req, res) => {
  const token = req.headers["x-session-token"];
  if (token) await logOut(token);
  res.json({ success: true });
});
