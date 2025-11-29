import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for highlighting
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  icon?: React.ReactNode;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to JobFlowCO Demo! 🎉',
    description: 'Take a quick tour to see how weather-aware scheduling can transform your lawn care business. We\'ve pre-loaded sample customers in Homewood, AL so you can explore all features right away.',
    position: 'center',
  },
  {
    id: 'weather-gradient',
    title: 'Weather Gradient Background 🌤️',
    description: 'Each day shows a color-coded weather gradient. Blue = rain, yellow = sunny, gray = cloudy. Quickly spot good and bad weather days at a glance to plan your schedule efficiently.',
    position: 'top',
  },
  {
    id: 'weather-suggestions',
    title: 'Automated Weather Suggestions 🤖',
    description: 'The app analyzes upcoming weather and automatically suggests moving jobs from rainy days to clear days. Accept suggestions with one click to optimize your schedule around the weather.',
    position: 'top',
  },
  {
    id: 'drag-drop',
    title: 'Drag & Drop Scheduling 🖱️',
    description: 'Simply drag job cards between days to reschedule. Drop them into specific time slots for precise scheduling. Your changes save automatically.',
    position: 'center',
  },
  {
    id: 'route-optimization',
    title: 'Route Optimization 🗺️',
    description: 'Click "Optimize Route" to automatically arrange jobs in the most efficient order using real driving distances. Save time and fuel every day.',
    position: 'top',
  },
  {
    id: 'navigation',
    title: 'Quick Navigation 📱',
    description: 'Use the bottom navigation bar to access: Daily Schedule, Insights Dashboard, Customer Management, Job Calendar, and Settings. Everything you need is just a tap away.',
    position: 'bottom',
  },
  {
    id: 'complete',
    title: 'You\'re All Set! ✅',
    description: 'Explore the demo freely. Try adding customers, scheduling jobs, or checking the insights dashboard. When you\'re ready to use JobFlowCO for your business, click Login to create your account.',
    position: 'center',
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
    }, 800);

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

  const isCenter = currentStepData.position === 'center';
  const isBottom = currentStepData.position === 'bottom';
  const isTop = currentStepData.position === 'top';

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] transition-opacity duration-300"
        onClick={handleSkip}
      />

      {/* Tutorial popup */}
      <div
        className={`fixed z-[9999] transition-all duration-300 ${
          isCenter
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            : isBottom
            ? 'bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-md'
            : isTop
            ? 'top-24 left-1/2 -translate-x-1/2 w-[90%] max-w-md'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
      >
        <Card className="bg-white shadow-2xl border-2 border-blue-200 w-[90vw] max-w-lg">
          <CardContent className="p-6">
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close tutorial"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            {/* Progress indicator */}
            <div className="flex gap-1 mb-4">
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
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-blue-900 mb-3">
                {currentStepData.title}
              </h2>
              <p className="text-gray-700 leading-relaxed">
                {currentStepData.description}
              </p>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                {currentStep < tutorialSteps.length - 1 ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={handleSkip}
                      className="text-gray-600"
                    >
                      Skip Tour
                    </Button>
                    <Button
                      onClick={handleNext}
                      className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleComplete}
                    className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Start Exploring
                  </Button>
                )}
              </div>
            </div>

            {/* Step counter */}
            <div className="text-center mt-4 text-sm text-gray-500">
              Step {currentStep + 1} of {tutorialSteps.length}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
