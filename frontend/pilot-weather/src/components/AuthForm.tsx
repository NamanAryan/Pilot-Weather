import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Separator } from "./ui/separator";
import { useToast } from "../hooks/use-toast";
import { supabase } from "../supabaseClient";
import { getEmailRedirectUrl, getRedirectUrl } from "../authConfig";
import { Plane, Mail } from "lucide-react";

const AuthForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: getEmailRedirectUrl(),
        },
      });

      if (error) {
        console.error("Magic link error:", error);
        toast({
          title: "Authentication Error",
          description:
            error.message || "Failed to send magic link. Please try again.",
          variant: "error",
        });
      } else {
        toast({
          title: "Email sent",
          description: "Check your inbox for the sign-in link",
          variant: "success",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getRedirectUrl(),
        },
      });

      if (error) {
        console.error("Google OAuth error:", error);
        toast({
          title: "Authentication Error",
          description:
            error.message || "Failed to sign in with Google. Please try again.",
          variant: "error",
        });
        setIsLoading(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-gray-800 to-black rounded-3xl mb-6 shadow-xl">
            <Plane className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-3">
            Pilot Briefing
          </h1>
          <p className="text-slate-600 text-lg">
            Aviation weather at your fingertips
          </p>
        </div>

        <Card className="bg-white rounded-3xl border-0 shadow-2xl">
          <CardHeader className="text-center space-y-3 pb-8">
            <CardTitle className="text-2xl font-bold text-slate-800">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-slate-600 text-lg">
              Sign in to access your flight briefings
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-gray-700 flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder=""
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 border-gray-200 focus:border-gray-800 focus:ring-2 focus:ring-gray-200 transition-all input-focus"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-gray-800 hover:bg-black text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 hover-lift btn-press"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </div>
                ) : (
                  "Get Link"
                )}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full bg-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-gray-500 font-medium">
                  Or continue with
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
                  Signing in...
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </div>
              )}
            </Button>

            {/* Subtle info */}
            <div className="text-center pt-2">
              <p className="text-xs text-gray-500">
                Secure authentication for aviation professionals
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthForm;
