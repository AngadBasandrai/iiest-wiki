import { useEffect, useState } from "react";
import { onChange, user } from "./auth.js";

export function useUser() {
  const [who, setWho] = useState(() => user());
  useEffect(() => onChange(setWho), []);
  return who;
}
