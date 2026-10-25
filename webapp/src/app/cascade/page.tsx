import type { Metadata } from 'next';
import CascadeConsole from '@/components/cascade/CascadeConsole';

export const metadata: Metadata = {
  title: 'PRAVAAH · 72-Hour Warning — cascading urban crisis forecaster',
  description: 'Predicts how a disruption cascades across drainage, roads, power, communications, ambulances and hospitals up to 72 hours ahead, learns how city systems depend on each other, and recommends preventive actions.',
};

export default function CascadePage() {
  return <CascadeConsole />;
}
