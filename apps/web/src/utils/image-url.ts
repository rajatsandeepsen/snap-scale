import { ENV } from "@/env.public";

export const imageUrl = (id: string) =>
  `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/images/${id}`;

export const markedUrl = (id: string, version: number) =>
  `${imageUrl(id)}/marked/${version}`;
