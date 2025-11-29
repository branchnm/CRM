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
    description: 'Let\'s explore the key features. Watch as each feature lights up!',
    position: 'top',
    offsetY: 20,
  },
  {
    id: 'weather-cards',
    title: 'Weather-Coded Days',
    description: 'Blue = rainy, Yellow = sunny. The gradient shows weather changing throughout the day!',
    targetSelector: '[data-date]', // Targets weather forecast cards
    animationType: 'glow',
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
    description: 'Jump to Insights, Customers, Calendar, and Settings from here!',
    targetSelector: 'nav', // Targets bottom navigation
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
        @keyframes tutorial-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
          }
          50% {
            transform: scale(1.02);
            box-shadow: 0 0 20px 10px rgba(59, 130, 246, 0.4);
          }
        }

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

        @keyframes tutorial-glow {
          0%, 100% {
            box-shadow: 0 0 15px 5px rgba(59, 130, 246, 0.6);
            filter: brightness(1);
          }
          50% {
            box-shadow: 0 0 30px 15px rgba(59, 130, 246, 0.9);
            filter: brightness(1.1);
          }
        }

        @keyframes tutorial-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .tutorial-pulse {
          animation: tutorial-pulse 2s ease-in-out infinite !important;
          position: relative !important;
          z-index: 9997 !important;
        }

        .tutorial-bounce {
          animation: tutorial-bounce 1.5s ease-in-out infinite !important;
          position: relative !important;
          z-index: 9997 !important;
        }

        .tutorial-glow {
          animation: tutorial-glow 2s ease-in-out infinite !important;
          position: relative !important;
          z-index: 9997 !important;
          border-radius: 12px !important;
        }

        .tutorial-shake {
          animation: tutorial-shake 0.5s ease-in-out infinite !important;
          position: relative !important;
          z-index: 9997 !important;
        }
      `}</style>
    </>
  );
}
