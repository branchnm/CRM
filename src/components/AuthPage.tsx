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
    <div className="h-screen w-screen bg-linear-to-br from-blue-50 via-white to-yellow-50 flex items-center justify-center overflow-hidden p-[2vh]">
      <div className="w-full max-w-md space-y-[2vh] flex flex-col" style={{ maxHeight: '96vh' }}>
        {/* Logo and Title */}
        <div className="text-center space-y-[1vh] shrink-0">
          <div className="flex justify-center mb-[1vh]">
            <div className="bg-linear-to-br from-blue-500 to-blue-700 rounded-2xl shadow-xl" style={{ padding: 'clamp(0.75rem, 1.5vh, 1.25rem)' }}>
              <CloudSun className="text-white drop-shadow-lg" style={{ height: 'clamp(3rem, 6vh, 4rem)', width: 'clamp(3rem, 6vh, 4rem)' }} />
            </div>
          </div>
          <h1 className="font-black text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-blue-700 to-blue-800 uppercase tracking-wider drop-shadow-sm" style={{ fontSize: 'clamp(1.5rem, 4vh, 2.5rem)' }}>
            Job Flow
          </h1>
          <p className="text-blue-700 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.8vh, 1.125rem)' }}>
            Your outdoor service business assistant
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border-2 border-blue-100 shadow-2xl bg-white/90 backdrop-blur flex-1 flex flex-col overflow-hidden">
          <CardHeader className="space-y-[1vh] shrink-0" style={{ padding: 'clamp(1rem, 2vh, 1.5rem)' }}>
            <CardTitle className="font-bold text-center text-blue-800" style={{ fontSize: 'clamp(1.25rem, 3vh, 2rem)' }}>
              Welcome Back
            </CardTitle>
            <CardDescription className="text-center text-blue-600" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>
              Sign in to manage your jobs and customers
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-auto" style={{ padding: '0 clamp(1rem, 2vh, 1.5rem) clamp(1rem, 2vh, 1.5rem)' }}>
            <Tabs defaultValue="login" className="w-full flex flex-col flex-1">
              <TabsList className="grid w-full grid-cols-2 bg-blue-50 p-1 shrink-0" style={{ marginBottom: 'clamp(1rem, 2vh, 1.5rem)', height: 'auto' }}>
                <TabsTrigger 
                  value="login"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white font-semibold rounded-md transition-all"
                  style={{ padding: 'clamp(0.5rem, 1.2vh, 0.75rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}
                >
                  Login
                </TabsTrigger>
                <TabsTrigger 
                  value="signup"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white font-semibold rounded-md transition-all"
                  style={{ padding: 'clamp(0.5rem, 1.2vh, 0.75rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-0 flex-1">
                <form onSubmit={handleLogin} className="space-y-[2vh]">
                  <div className="space-y-[0.5vh]">
                    <Label htmlFor="login-email" className="text-blue-900 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>
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
                      className="border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                      style={{ height: 'clamp(2.5rem, 5vh, 3rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}
                    />
                  </div>
                  <div className="space-y-[0.5vh]">
                    <Label htmlFor="login-password" className="text-blue-900 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>
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
                      className="border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                      style={{ height: 'clamp(2.5rem, 5vh, 3rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="border-2" style={{ padding: 'clamp(0.5rem, 1.2vh, 0.75rem)' }}>
                      <AlertDescription style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="bg-green-50 border-2 border-green-300" style={{ padding: 'clamp(0.5rem, 1.2vh, 0.75rem)' }}>
                      <AlertDescription className="text-green-800 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg hover:shadow-xl transition-all rounded-lg" 
                    disabled={isLoading}
                    style={{ height: 'clamp(2.5rem, 5vh, 3rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)', marginTop: 'clamp(1rem, 2vh, 1.5rem)' }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 animate-spin" style={{ height: 'clamp(1rem, 2vh, 1.25rem)', width: 'clamp(1rem, 2vh, 1.25rem)' }} />
                        Logging in...
                      </>
                    ) : (
                      'Login to Job Flow'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0 flex-1">
                <form onSubmit={handleSignup} className="space-y-[1.5vh]">
                  <div className="space-y-[0.5vh]">
                    <Label htmlFor="signup-email" className="text-blue-900 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>
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
                      className="border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                      style={{ height: 'clamp(2.5rem, 5vh, 3rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}
                    />
                  </div>
                  <div className="space-y-[0.5vh]">
                    <Label htmlFor="signup-password" className="text-blue-900 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>
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
                      className="border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                      style={{ height: 'clamp(2.5rem, 5vh, 3rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}
                    />
                  </div>
                  <div className="space-y-[0.5vh]">
                    <Label htmlFor="signup-confirm-password" className="text-blue-900 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>
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
                      className="border-2 border-blue-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg transition-all"
                      style={{ height: 'clamp(2.5rem, 5vh, 3rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="border-2" style={{ padding: 'clamp(0.5rem, 1.2vh, 0.75rem)' }}>
                      <AlertDescription style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="bg-green-50 border-2 border-green-300" style={{ padding: 'clamp(0.5rem, 1.2vh, 0.75rem)' }}>
                      <AlertDescription className="text-green-800 font-medium" style={{ fontSize: 'clamp(0.875rem, 1.6vh, 1rem)' }}>{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg hover:shadow-xl transition-all rounded-lg" 
                    disabled={isLoading}
                    style={{ height: 'clamp(2.5rem, 5vh, 3rem)', fontSize: 'clamp(0.875rem, 1.6vh, 1rem)', marginTop: 'clamp(1rem, 2vh, 1.5rem)' }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 animate-spin" style={{ height: 'clamp(1rem, 2vh, 1.25rem)', width: 'clamp(1rem, 2vh, 1.25rem)' }} />
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
        <div className="text-center shrink-0">
          <p className="text-blue-600 font-medium" style={{ fontSize: 'clamp(0.75rem, 1.4vh, 0.875rem)' }}>
            🔒 Secure authentication powered by Supabase
          </p>
        </div>
      </div>
    </div>
  );
}
