import { ENV } from "@/env.public";

export const imageUrl = (id: string) =>
  `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/images/${id}`;

export const markedUrl = (id: string, version?: number) =>
  `${imageUrl(id)}/marked${version ? `?v=${version}` : ""}`;

export const formatMm = (mm: number) =>
  mm < 100 ? `${mm.toFixed(1)} mm` : `${(mm / 10).toFixed(1)} cm`;
