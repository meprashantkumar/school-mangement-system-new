import jwt from "jsonwebtoken";
import { env } from "../config/env";

export const generateToken = (id: string): string => {
  const options: jwt.SignOptions = {
    expiresIn: env.jwtExpire as jwt.SignOptions["expiresIn"],
  };
  return jwt.sign({ id }, env.jwtSecret, options);
};
