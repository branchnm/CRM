import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string; // CSS selector for the element to animate/highlight
  animationType?: 'pulse' | 'bounce' | 'glow' | 'shake'; // Animation style
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offsetX?: number; // Fine-tune horizontal position
  offsetY?: number; // Fine-tune vertical position
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to JobFlowCO! 🎉',
    description: 'Let\'s explore the key features with sample data!',
    position: 'top',
    offsetY: 20,
  },
  {
    id: 'weather-cards',
    title: 'Weather-Coded Days',
    description: 'Each day shows weather through color gradients - see the examples below!',
    position: 'top',
    offsetY: 20,
  },
  {
    id: 'weather-suggestions',
    title: 'Smart Suggestions',
    description: 'Rain forecast? We\'ll suggest rescheduling jobs to better weather days!',
    position: 'top',
    offsetY: 20,
  },
  {
    id: 'drag-drop',
    title: 'Drag & Drop Jobs',
    description: 'Grab any job card and drag it to a different day. Works on mobile too!',
    position: 'top',
    offsetY: 20,
  },
  {
    id: 'route-optimize',
    title: 'Auto Route Optimization',
    description: 'Arranges jobs in the fastest driving order using real GPS data!',
    position: 'top',
    offsetY: 20,
  },
  {
    id: 'bottom-nav',
    title: 'Quick Access Menu',
    description: 'Jump to Insights, Customers, Calendar, and Settings from the bottom bar!',
    targetSelector: 'nav',
    animationType: 'bounce',
    position: 'top',
    offsetY: 20,
  },
  {
    id: 'complete',
    title: 'You\'re Ready! ✅',
    description: 'Explore freely! When ready for your business, tap Login.',
    position: 'top',
    offsetY: 20,
  },
];

interface DemoTutorialProps {
  onComplete?: () => void;
}

export function DemoTutorial({ onComplete }: DemoTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(false);
  const [animatedElements, setAnimatedElements] = useState<Element[]>([]);

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
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Animate target elements when step changes
  useEffect(() => {
    if (!isVisible) return;

    // Remove animation from previous elements
    animatedElements.forEach(el => {
      el.classList.remove('tutorial-pulse', 'tutorial-bounce', 'tutorial-glow', 'tutorial-shake');
    });
    setAnimatedElements([]);

    const step = tutorialSteps[currentStep];
    
    if (step.targetSelector && step.animationType) {
      // Find and animate target element(s)
      const findAndAnimate = () => {
        const elements = document.querySelectorAll(step.targetSelector!);
        if (elements.length > 0) {
          const elementsArray = Array.from(elements);
          elementsArray.forEach(el => {
            el.classList.add(`tutorial-${step.animationType}`);
          });
          setAnimatedElements(elementsArray);
          return true;
        }
        return false;
      };

      // Try immediately
      if (!findAndAnimate()) {
        // Retry if not found
        const retryInterval = setInterval(() => {
          if (findAndAnimate()) {
            clearInterval(retryInterval);
          }
        }, 200);

        const timeout = setTimeout(() => {
          clearInterval(retryInterval);
        }, 2000);

        return () => {
          clearInterval(retryInterval);
          clearTimeout(timeout);
        };
      }
    }
  }, [currentStep, isVisible]);

  const currentStepData = tutorialSteps[currentStep];

  // Render static weather card examples for the weather-cards step
  const renderWeatherExamples = () => {
    if (currentStep !== 1) return null; // Only show on step 2 (weather-cards)

    return (
      <div className="fixed top-40 left-1/2 -translate-x-1/2 z-[9997] w-[90vw] max-w-2xl">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border-2 border-blue-300 p-4">
          <p className="text-xs text-center text-gray-600 mb-3 font-medium">
            Weather Gradient Examples
          </p>
          <div className="grid grid-cols-3 gap-3">
            {/* Sunny Day */}
            <div className="text-center">
              <div 
                className="rounded-lg h-32 mb-2 shadow-md flex flex-col items-center justify-center p-2"
                style={{ background: 'linear-gradient(to bottom, #FEF9C3, #FDE047, #FBBF24)' }}
              >
                <div className="text-3xl mb-1">☀️</div>
                <div className="text-xs font-semibold text-gray-800">Clear & Sunny</div>
                <div className="text-[10px] text-gray-600 mt-1">All day sunshine</div>
              </div>
              <p className="text-xs text-gray-600">Yellow gradient</p>
            </div>

            {/* Mixed Weather */}
            <div className="text-center">
              <div 
                className="rounded-lg h-32 mb-2 shadow-md flex flex-col items-center justify-center p-2"
                style={{ background: 'linear-gradient(to bottom, #93C5FD, #E5E7EB, #FEF9C3)' }}
              >
                <div className="text-3xl mb-1">⛅</div>
                <div className="text-xs font-semibold text-gray-800">Clearing Up</div>
                <div className="text-[10px] text-gray-600 mt-1">Rain → Clouds → Sun</div>
              </div>
              <p className="text-xs text-gray-600">Blue to yellow</p>
            </div>

            {/* Rainy Day */}
            <div className="text-center">
              <div 
                className="rounded-lg h-32 mb-2 shadow-md flex flex-col items-center justify-center p-2"
                style={{ background: 'linear-gradient(to bottom, #1E3A8A, #3B82F6, #60A5FA)' }}
              >
                <div className="text-3xl mb-1">🌧️</div>
                <div className="text-xs font-semibold text-white">Heavy Rain</div>
                <div className="text-[10px] text-blue-100 mt-1">Rainy all day</div>
              </div>
              <p className="text-xs text-gray-600">Dark blue gradient</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-center text-gray-500">
              💡 Darker blue = heavier rain. Light blue = drizzle. Yellow = sunny!
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Render smart suggestions example
  const renderSuggestionsExample = () => {
    if (currentStep !== 2) return null;

    return (
      <div className="fixed top-40 left-1/2 -translate-x-1/2 z-[9997] w-[90vw] max-w-md">
        <div className="bg-white border-2 border-blue-500 rounded-lg overflow-hidden shadow-2xl">
          <div className="px-3 py-2">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded font-medium">
                  Rain
                </span>
                <span className="text-xs text-gray-600 font-medium">
                  Saturday forecast
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-700 mb-2">
              💡 Rain expected 10am-2pm. Move 3 jobs to better days?
            </p>
            <div className="flex gap-2">
              <button className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md font-medium">
                Accept All
              </button>
              <button className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-md font-medium">
                Dismiss
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-center text-gray-500 mt-2">
          Click "Accept All" to automatically reschedule!
        </p>
      </div>
    );
  };

  // Render drag and drop example
  const renderDragDropExample = () => {
    if (currentStep !== 3) return null;

    return (
      <div className="fixed top-40 left-1/2 -translate-x-1/2 z-[9997] w-[90vw] max-w-md">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border-2 border-blue-300 p-4">
          <p className="text-xs text-center text-gray-600 mb-3 font-medium">
            Drag & Drop Example
          </p>
          <div className="flex items-center gap-3 justify-center">
            <div className="bg-white border-2 border-gray-200 rounded-lg p-2 shadow-sm">
              <div className="text-xs font-semibold text-gray-900">John Smith</div>
              <div className="text-[10px] text-gray-500">123 Main St</div>
              <div className="text-[10px] text-blue-600 mt-1">8:00 AM</div>
            </div>
            <div className="text-2xl animate-pulse">👉</div>
            <div className="bg-blue-50 border-2 border-dashed border-blue-400 rounded-lg p-2 h-16 w-24 flex items-center justify-center">
              <div className="text-[10px] text-blue-600 font-medium text-center">Drop here<br/>for new date</div>
            </div>
          </div>
          <p className="text-xs text-center text-gray-500 mt-3">
            🖱️ Click and hold a job card, then drag to any day!
          </p>
        </div>
      </div>
    );
  };

  // Render route optimization example
  const renderRouteExample = () => {
    if (currentStep !== 4) return null;

    return (
      <div className="fixed top-40 left-1/2 -translate-x-1/2 z-[9997] w-[90vw] max-w-md">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border-2 border-blue-300 p-4">
          <p className="text-xs text-center text-gray-600 mb-3 font-medium">
            Route Optimization
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-lg">❌</div>
              <div className="flex-1 text-xs text-gray-600">
                <span className="font-semibold">Before:</span> Drive 45 min between jobs
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-lg">✅</div>
              <div className="flex-1 text-xs text-gray-600">
                <span className="font-semibold">After:</span> Drive 18 min - save 27 min!
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-center text-gray-500">
              🗺️ Click "Optimize Route" to arrange jobs by shortest drive time
            </p>
          </div>
        </div>
      </div>
    );
  };

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
    // Remove all animations
    animatedElements.forEach(el => {
      el.classList.remove('tutorial-pulse', 'tutorial-bounce', 'tutorial-glow', 'tutorial-shake');
    });
    
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

      {/* Weather examples display */}
      {renderWeatherExamples()}
      {renderSuggestionsExample()}
      {renderDragDropExample()}
      {renderRouteExample()}

      {/* Simple info card - always centered at top */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] w-[90vw] max-w-md">
        <Card className="bg-white/95 backdrop-blur-sm shadow-xl border-2 border-blue-400 animate-in fade-in slide-in-from-top duration-500">
          <CardContent className="p-4">
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute top-2 right-2 p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10"
              aria-label="Close tutorial"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>

            {/* Progress dots */}
            <div className="flex gap-1.5 mb-3 justify-center">
              {tutorialSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${
                    index === currentStep 
                      ? 'bg-blue-600 scale-125' 
                      : index < currentStep 
                      ? 'bg-blue-400' 
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <div className="mb-3 text-center">
              <h3 className="text-base font-bold text-gray-900 mb-1.5">
                {currentStepData.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {currentStepData.description}
              </p>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>

              <span className="text-xs text-gray-500 font-medium">
                {currentStep + 1} / {tutorialSteps.length}
              </span>

              {currentStep < tutorialSteps.length - 1 ? (
                <Button
                  onClick={handleNext}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-xs px-4"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-xs px-4"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Done
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CSS animations injected into page */}
      <style>{`
        @keyframes tutorial-bounce {
          0%, 100% {
            transform: translateY(0);
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          }
          50% {
            transform: translateY(-10px);
            box-shadow: 0 20px 25px -5px rgb(59 130 246 / 0.4);
          }
        }

        .tutorial-bounce {
          animation: tutorial-bounce 1.5s ease-in-out infinite !important;
          position: relative !important;
          z-index: 9997 !important;
        }
      `}</style>
    </>
  );
}
