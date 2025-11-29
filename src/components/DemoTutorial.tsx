import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { X } from 'lucide-react';

interface DemoTutorialProps {
  onComplete?: () => void;
}

export function DemoTutorial({ onComplete }: DemoTutorialProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(false);

  useEffect(() => {
    // Check if user has already seen the tutorial
    const completed = localStorage.getItem('demoTutorialCompleted');
    if (completed === 'true') {
      setHasCompletedTutorial(true);
      return;
    }

    // Show simple welcome message after a brief delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('demoTutorialCompleted', 'true');
    setHasCompletedTutorial(true);
    onComplete?.();
  };

  if (hasCompletedTutorial || !isVisible) {
    return null;
  }

  return (
    <>
      {/* Subtle overlay */}
      <div className="fixed inset-0 bg-black/5 z-[9998] pointer-events-none transition-opacity duration-300" />

      {/* Simple welcome card */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] w-[90vw] max-w-md">
        <Card className="bg-white/95 backdrop-blur-sm shadow-xl border-2 border-blue-400 animate-in fade-in slide-in-from-top duration-500">
          <CardContent className="p-4">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>

            {/* Content */}
            <div className="text-center pr-6">
              <h3 className="text-lg font-bold text-blue-900 mb-2">
                🎉 Welcome to JobFlowCO Demo!
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                Sample data is loaded and ready to explore. Try dragging jobs between days, checking weather forecasts, and optimizing routes!
              </p>
              <Button
                onClick={handleDismiss}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-xs w-full"
              >
                Got it, let's explore!
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
