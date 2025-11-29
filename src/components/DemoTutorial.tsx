import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { X, ChevronRight, ChevronLeft, Check, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for highlighting
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  arrow?: 'up' | 'down' | 'left' | 'right';
  highlightArea?: string; // CSS selector to highlight with a glowing border
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to JobFlowCO Demo! 🎉',
    description: 'This quick tour will show you the key features. The app is pre-loaded with sample customers in Homewood, AL.',
    position: 'top-center',
  },
  {
    id: 'weather-gradient',
    title: 'Weather Gradient 🌤️',
    description: 'See the color-coded weather cards above? Blue = rain, yellow = sunny, gray = cloudy. Quickly spot good weather days.',
    position: 'bottom-center',
    arrow: 'up',
  },
  {
    id: 'weather-suggestions',
    title: 'Smart Suggestions 🤖',
    description: 'Look for the suggestion banner that appears when weather changes. It automatically suggests moving jobs from rainy to clear days!',
    position: 'bottom-left',
    arrow: 'up',
  },
  {
    id: 'drag-drop',
    title: 'Drag & Drop Jobs 🖱️',
    description: 'Try it now! Drag any job card to a different day. Your changes save automatically. Works on mobile too!',
    position: 'top-right',
    arrow: 'down',
  },
  {
    id: 'route-optimization',
    title: 'Route Optimizer 🗺️',
    description: 'Click "Optimize Route" above to arrange jobs in the most efficient driving order. Real GPS data calculates the fastest sequence.',
    position: 'bottom-right',
    arrow: 'up',
  },
  {
    id: 'navigation',
    title: 'Quick Navigation 📱',
    description: 'Use the bottom bar to explore: Insights Dashboard, Customers, Job Calendar, and Settings. Everything is just a tap away!',
    position: 'top-center',
    arrow: 'down',
  },
  {
    id: 'complete',
    title: 'Start Exploring! ✅',
    description: 'You\'re all set! Try adding customers, rescheduling jobs, or viewing the insights dashboard. Ready to use it for real? Click the login button.',
    position: 'top-center',
  },
];

interface DemoTutorialProps {
  onComplete?: () => void;
}

export function DemoTutorial({ onComplete }: DemoTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(false);

  useEffect(() => {
    // Check if user has already seen the tutorial
    const completed = localStorage.getItem('demoTutorialCompleted');
    if (completed === 'true') {
      setHasCompletedTutorial(true);
      return;
    }

    // Show tutorial after a brief delay for page to load
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const currentStepData = tutorialSteps[currentStep];

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setIsVisible(false);
    localStorage.setItem('demoTutorialCompleted', 'true');
    setHasCompletedTutorial(true);
    onComplete?.();
  };

  if (hasCompletedTutorial || !isVisible) {
    return null;
  }

  // Position classes based on step position
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-24 left-4 md:bottom-4',
    'bottom-right': 'bottom-24 right-4 md:bottom-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-24 left-1/2 -translate-x-1/2 md:bottom-4',
  };

  const ArrowIcon = currentStepData.arrow === 'up' ? ArrowUp :
                     currentStepData.arrow === 'down' ? ArrowDown :
                     currentStepData.arrow === 'left' ? ArrowLeft :
                     currentStepData.arrow === 'right' ? ArrowRight : null;

  return (
    <>
      {/* Semi-transparent overlay - much lighter, doesn't blur */}
      <div className="fixed inset-0 bg-black/20 z-[9998] pointer-events-none transition-opacity duration-300" />

      {/* Tutorial popup - compact and positioned */}
      <div
        className={`fixed z-[9999] transition-all duration-300 ${positionClasses[currentStepData.position]} w-[90vw] max-w-sm`}
      >
        <Card className="bg-white shadow-2xl border-2 border-blue-400 animate-in fade-in slide-in-from-top-4 duration-500">
          <CardContent className="p-4">
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute -top-2 -right-2 p-1.5 bg-white hover:bg-gray-100 rounded-full transition-colors shadow-lg border border-gray-200"
              aria-label="Close tutorial"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>

            {/* Progress indicator */}
            <div className="flex gap-1 mb-3">
              {tutorialSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <div className="mb-4">
              <h3 className="text-lg font-bold text-blue-900 mb-2 flex items-center gap-2">
                {currentStepData.title}
                {ArrowIcon && (
                  <ArrowIcon className="w-5 h-5 text-blue-600 animate-bounce" />
                )}
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {currentStepData.description}
              </p>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="text-xs"
              >
                <ChevronLeft className="w-3 h-3 mr-1" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {currentStep + 1}/{tutorialSteps.length}
                </span>
                {currentStep < tutorialSteps.length - 1 ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSkip}
                      className="text-xs text-gray-600"
                    >
                      Skip
                    </Button>
                    <Button
                      onClick={handleNext}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-xs"
                    >
                      Next
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleComplete}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-xs"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Got it!
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
