"use client";

import { useEffect, useState } from "react";
import styles from "./SealStamp.module.css";

/**
 * Mount with a fresh `key` each time an action succeeds (e.g. `key={stampKey}`
 * where `stampKey` increments) to replay the pop-and-fade animation.
 */
export default function SealStamp() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return <span className={styles.stamp} aria-hidden="true" />;
}
