import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, CloudSun } from 'lucide-react';
import { signIn, signUp } from '../services/auth';

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const { user, error: authError } = await signIn(loginEmail, loginPassword);
      
      if (authError) {
        setError(authError.message);
      } else if (user) {
        setSuccess('Login successful!');
        // Auth state change will be handled by App.tsx
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (signupPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      const { user, error: authError } = await signUp(signupEmail, signupPassword);
      
      if (authError) {
        setError(authError.message);
      } else if (user) {
        setSuccess('Account created! You can now log in.');
        // Clear signup form
        setSignupEmail('');
        setSignupPassword('');
        setSignupConfirmPassword('');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Signup error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-yellow-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">
        {/* Logo and Title */}
        <div className="text-center space-y-2 sm:space-y-3">
          <div className="flex justify-center mb-2 sm:mb-3">
            <div className="bg-linear-to-br from-blue-500 to-blue-700 p-3 sm:p-4 md:p-5 rounded-2xl sm:rounded-3xl shadow-xl">
              <CloudSun className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-white drop-shadow-lg" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-blue-700 to-blue-800 uppercase tracking-wider drop-shadow-sm px-2">
            Job Flow
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-blue-700 font-medium px-2">
            Your outdoor service business assistant
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border-2 border-blue-100 shadow-2xl bg-white/90 backdrop-blur">
          <CardHeader className="space-y-2 pb-4 sm:pb-6 px-4 sm:px-6 pt-5 sm:pt-6">
            <CardTitle className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-blue-800">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-center text-sm sm:text-base text-blue-600">
              Sign in to manage your jobs and customers
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 px-4 sm:px-6 pb-5 sm:pb-6">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-5 sm:mb-6 bg-blue-50 p-1 h-auto">
                <TabsTrigger 
                  value="login"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white py-2 sm:py-2.5 text-sm sm:text-base font-semibold rounded-md transition-all"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger 
                  value="signup"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white py-2 sm:py-2.5 text-sm sm:text-base font-semibold rounded-md transition-all"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm sm:text-base text-blue-900 font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 sm:h-12 text-base border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm sm:text-base text-blue-900 font-medium">
                      Password
                    </Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 sm:h-12 text-base border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="py-3 border-2">
                      <AlertDescription className="text-sm sm:text-base">{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="bg-green-50 border-2 border-green-300 py-3">
                      <AlertDescription className="text-green-800 text-sm sm:text-base font-medium">{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full h-11 sm:h-12 bg-blue-600 hover:bg-blue-700 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all rounded-lg mt-6" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      'Login to Job Flow'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignup} className="space-y-4 sm:space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm sm:text-base text-blue-900 font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 sm:h-12 text-base border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm sm:text-base text-blue-900 font-medium">
                      Password
                    </Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="At least 6 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 sm:h-12 text-base border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password" className="text-sm sm:text-base text-blue-900 font-medium">
                      Confirm Password
                    </Label>
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      placeholder="Re-enter your password"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 sm:h-12 text-base border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="py-3 border-2">
                      <AlertDescription className="text-sm sm:text-base">{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="bg-green-50 border-2 border-green-300 py-3">
                      <AlertDescription className="text-green-800 text-sm sm:text-base font-medium">{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full h-11 sm:h-12 bg-blue-600 hover:bg-blue-700 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all rounded-lg mt-6" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Your Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center space-y-1 sm:space-y-2 px-2">
          <p className="text-xs sm:text-sm text-blue-600 font-medium">
            🔒 Secure authentication powered by Supabase
          </p>
        </div>
      </div>
    </div>
  );
}
