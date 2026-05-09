import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { loginUser, getCurrentUser, verifyToken } from "@/services/authService.js";
import { validateBody } from "@/middleware/validate.js";
import { formatApiResponse } from "@autoops/shared";
import { UnauthorizedError } from "@autoops/shared";

const router: IRouter = Router();

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

router.post(
  "/login",
  validateBody(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as z.infer<typeof LoginSchema>;
      const result = await loginUser(email, password);

      // Set httpOnly cookie for web clients
      res.cookie("autoops_token", result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "lax",
        maxAge: result.tokens.expiresIn * 1000,
        path: "/",
      });

      res.status(200).json(
        formatApiResponse(
          { user: result.user, accessToken: result.tokens.accessToken, expiresIn: result.tokens.expiresIn },
          "Login successful"
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("autoops_token", { path: "/" });
  res.status(200).json(formatApiResponse(null, "Logged out successfully"));
});

router.get(
  "/me",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token =
        (req.cookies as Record<string, string | undefined>)?.["autoops_token"] ??
        req.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) throw new UnauthorizedError("Not authenticated");

      const payload = verifyToken(token);
      const user = await getCurrentUser(payload.userId);
      res.json(formatApiResponse(user));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
