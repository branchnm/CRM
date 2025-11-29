import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { X, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string; // CSS selector for the element to point to
  highlightSelector?: string; // CSS selector for element to highlight with glow
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offsetX?: number; // Fine-tune horizontal position
  offsetY?: number; // Fine-tune vertical position
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to JobFlowCO! 🎉',
    description: 'Let\'s take a quick tour of the key features. Sample data is already loaded so you can try everything!',
    position: 'top-left',
    offsetX: 20,
    offsetY: 80,
  },
  {
    id: 'weather-cards',
    title: 'Weather-Coded Days 🌤️',
    description: 'Each day card shows weather with colors: Blue tones = rain/clouds, Yellow tones = sunny. The gradient shows how weather changes throughout the day!',
    targetSelector: '[data-date]', // Targets first weather forecast card
    position: 'bottom',
    offsetY: -20,
  },
  {
    id: 'weather-suggestions',
    title: 'Smart Suggestions 🤖',
    description: 'When rain is forecast, a banner appears suggesting which jobs to reschedule. Click "Accept" to automatically move jobs to better weather days!',
    position: 'top-left',
    offsetX: 20,
    offsetY: 180,
  },
  {
    id: 'drag-drop',
    title: 'Drag & Drop Jobs 🖱️',
    description: 'Try it! Grab any job card below and drag it to a different day. Your schedule updates automatically. Works perfectly on mobile too!',
    position: 'top-right',
    offsetX: -20,
    offsetY: 160,
  },
  {
    id: 'route-optimize',
    title: 'Auto Route Optimization 🗺️',
    description: 'Look for "Optimize Route" button. It uses real GPS data to arrange jobs in the fastest driving order - saving you time and fuel every day!',
    position: 'bottom-left',
    offsetX: 20,
    offsetY: -100,
  },
  {
    id: 'bottom-nav',
    title: 'Quick Access Menu 📱',
    description: 'The bottom bar lets you jump to: Insights Dashboard (see your earnings), Customers, Job Calendar, and Settings. Tap any icon to explore!',
    targetSelector: 'nav', // Targets bottom navigation
    position: 'top',
    offsetY: -140,
  },
  {
    id: 'complete',
    title: 'You\'re Ready! ✅',
    description: 'Explore freely - add customers, reschedule jobs, check insights. When you\'re ready to use JobFlowCO for your business, tap Login to get started!',
    position: 'top-left',
    offsetX: 20,
    offsetY: 100,
  },
];

interface DemoTutorialProps {
  onComplete?: () => void;
}

export function DemoTutorial({ onComplete }: DemoTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [targetPosition, setTargetPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

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
    }, 1500); // Longer delay to ensure UI is rendered

    return () => clearTimeout(timer);
  }, []);

  // Update popup position when step changes
  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      const step = tutorialSteps[currentStep];
      
      if (step.targetSelector) {
        // Find the target element
        const target = document.querySelector(step.targetSelector);
        if (target) {
          const rect = target.getBoundingClientRect();
          setTargetPosition({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });

          // Position popup relative to target
          let top = 0;
          let left = 0;

          switch (step.position) {
            case 'top':
              top = rect.top - 180; // Above target
              left = rect.left + rect.width / 2 - 192; // Center (assuming 384px popup width)
              break;
            case 'bottom':
              top = rect.bottom + 20; // Below target
              left = rect.left + rect.width / 2 - 192;
              break;
            case 'left':
              top = rect.top + rect.height / 2 - 75;
              left = rect.left - 404; // Left of target (384px + 20px gap)
              break;
            case 'right':
              top = rect.top + rect.height / 2 - 75;
              left = rect.right + 20;
              break;
            case 'top-left':
              top = rect.top - 180;
              left = rect.left;
              break;
            case 'top-right':
              top = rect.top - 180;
              left = rect.right - 384;
              break;
            case 'bottom-left':
              top = rect.bottom + 20;
              left = rect.left;
              break;
            case 'bottom-right':
              top = rect.bottom + 20;
              left = rect.right - 384;
              break;
          }

          setPopupPosition({
            top: top + (step.offsetY || 0),
            left: left + (step.offsetX || 0),
          });
        } else {
          setTargetPosition(null);
          // Fallback to static position if target not found
          setStaticPosition(step);
        }
      } else {
        setTargetPosition(null);
        setStaticPosition(step);
      }
    };

    const setStaticPosition = (step: TutorialStep) => {
      // Static positioning when no target
      const positions: Record<string, { top: number; left: number }> = {
        'top-left': { top: step.offsetY || 80, left: step.offsetX || 20 },
        'top-right': { top: step.offsetY || 80, left: window.innerWidth - (step.offsetX || 20) - 384 },
        'bottom-left': { top: window.innerHeight - (step.offsetY || 200), left: step.offsetX || 20 },
        'bottom-right': { top: window.innerHeight - (step.offsetY || 200), left: window.innerWidth - (step.offsetX || 20) - 384 },
      };

      setPopupPosition(positions[step.position] || { top: 80, left: 20 });
    };

    updatePosition();
    
    // Recalculate on scroll and resize
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
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
      {/* Light overlay - doesn't blur */}
      <div className="fixed inset-0 bg-black/10 z-[9998] pointer-events-none transition-opacity duration-300" />

      {/* Highlight spotlight on target element */}
      {targetPosition && (
        <>
          {/* Animated spotlight ring */}
          <div
            className="fixed z-[9997] pointer-events-none"
            style={{
              top: targetPosition.top - 8,
              left: targetPosition.left - 8,
              width: targetPosition.width + 16,
              height: targetPosition.height + 16,
            }}
          >
            <div className="absolute inset-0 rounded-lg border-4 border-blue-500 animate-pulse shadow-2xl shadow-blue-500/50" />
            <div className="absolute inset-0 rounded-lg border-2 border-blue-400 animate-ping" />
          </div>

          {/* Connecting line from popup to target */}
          <svg
            className="fixed z-[9998] pointer-events-none"
            style={{
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#3B82F6" />
              </marker>
            </defs>
            <line
              x1={popupPosition.left + 192} // Center of popup
              y1={popupPosition.top + 75}
              x2={targetPosition.left + targetPosition.width / 2}
              y2={targetPosition.top + targetPosition.height / 2}
              stroke="#3B82F6"
              strokeWidth="3"
              strokeDasharray="8,4"
              markerEnd="url(#arrowhead)"
              className="animate-pulse"
            />
          </svg>
        </>
      )}

      {/* Tutorial popup - positioned dynamically */}
      <div
        className="fixed z-[9999] transition-all duration-500 ease-out w-[90vw] max-w-sm"
        style={{
          top: `${popupPosition.top}px`,
          left: `${popupPosition.left}px`,
        }}
      >
        <Card className="bg-white shadow-2xl border-4 border-blue-500 animate-in fade-in zoom-in duration-500 relative">
          {/* Sparkle indicator */}
          <div className="absolute -top-3 -right-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full p-2 shadow-lg animate-bounce">
            <Sparkles className="w-5 h-5 text-white" />
          </div>

          <CardContent className="p-4">
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute top-2 right-2 p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10"
              aria-label="Close tutorial"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>

            {/* Progress indicator */}
            <div className="flex gap-1 mb-3">
              {tutorialSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    index <= currentStep ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <div className="mb-4 pr-6">
              <h3 className="text-lg font-bold text-blue-900 mb-2">
                {currentStepData.title}
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
                <span className="text-xs text-gray-500 font-medium">
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
                      className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-xs"
                    >
                      Next
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleComplete}
                    size="sm"
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-xs"
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
