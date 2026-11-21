import { expect, test } from "bun:test";

import {
  homography,
  measureOnPlane,
  orderClockwise,
  project,
  type Quad,
} from "./geometry";

const camera: Quad = [
  [120, 340],
  [610, 300],
  [700, 720],
  [60, 760],
];
const plane: Quad = [
  [0, 0],
  [400, 0],
  [400, 300],
  [0, 300],
];
const toImage = homography(plane, camera);

test("recovers sizes through a perspective transform", () => {
  const card = (
    [
      [10, 10],
      [95.6, 10],
      [95.6, 63.98],
      [10, 63.98],
    ] as Quad
  ).map((p) => project(toImage, p)) as Quad;
  const box = (
    [
      [150, 50],
      [350, 50],
      [350, 170],
      [150, 170],
    ] as Quad
  ).map((p) => project(toImage, p)) as Quad;
  const r = measureOnPlane(
    orderClockwise([card[2], card[0], card[3], card[1]]),
    [53.98, 85.6],
    box,
  );
  expect(r.lengthMm).toBeCloseTo(200, 3);
  expect(r.widthMm).toBeCloseTo(120, 3);
});
