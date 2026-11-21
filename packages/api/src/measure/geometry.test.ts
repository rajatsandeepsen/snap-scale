import { expect, test } from "bun:test";

import {
  homography,
  rebuildHiddenCorner,
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

test("numbers corners clockwise from the top-left", () => {
  expect(
    orderClockwise([
      [10, 90],
      [90, 10],
      [12, 8],
      [95, 85],
    ]),
  ).toEqual([
    [12, 8],
    [90, 10],
    [95, 85],
    [10, 90],
  ]);
});

test("uses the higher-priority opposite side", () => {
  const ref: Quad = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ];
  // Sides 1-2 = 100 and 3-4 = 140 mm; 2-3 and 4-1 = 50 mm.
  const main: Quad = [
    [0, 100],
    [100, 100],
    [120, 150],
    [-20, 150],
  ];
  const r = measureOnPlane(ref, [100, 50], main, [4, 1, 1, 1]);
  expect(r.mainSidesMm[0]).toBeCloseTo(100);
  expect(r.mainSidesMm[2]).toBeCloseTo(140);
  expect(r.lengthMm).toBeCloseTo(100);
  expect(measureOnPlane(ref, [100, 50], main).lengthMm).toBeCloseTo(120);
});

test("rebuilds a corner whose two sides are both unreliable", () => {
  const q: Quad = [
    [0, 0],
    [100, 0],
    [130, 70],
    [0, 50],
  ];
  expect(rebuildHiddenCorner(q, [5, 1, 2, 5])).toEqual({
    quad: [
      [0, 0],
      [100, 0],
      [100, 50],
      [0, 50],
    ],
    rebuilt: 2,
  });
  expect(rebuildHiddenCorner(q, [5, 1, 4, 5]).rebuilt).toBeNull();
});
