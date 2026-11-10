import React from 'react';
import ReactDOM from 'react-dom/client';
import { GalleryBenchmark } from './benchmarkGallery';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Gallery benchmark root element is missing.');

ReactDOM.createRoot(rootElement).render(<GalleryBenchmark />);
