import React from 'react';
import { Composition } from 'remotion';
import { UsdRate, FPS, DURATION } from './UsdRate';

export const RemotionRoot: React.FC = () => (
  <Composition id="UsdRate" component={UsdRate} width={1080} height={1920} fps={FPS} durationInFrames={DURATION * FPS} />
);
