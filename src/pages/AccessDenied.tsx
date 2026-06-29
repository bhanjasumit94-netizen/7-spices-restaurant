import { Link } from "react-router-dom";
import { ShieldOff, ArrowLeft } from "lucide-react";
import { Button } from "../components/UI";
import { useAuth } from "../lib/auth";
import { getDefaultRoute } from "../lib/permissions";

export default function AccessDenied() {
  const { user } = useAuth();
  const home = getDefaultRoute(user?.role);

  return (
    <div className="min-h-screen flex items-center justify-center bg-premium p-6">
      <div className="max-w-md w-full panel p-8 text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
          <ShieldOff className="h-8 w-8 text-rose-600" />
        </div>
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-sm text-neutral-500">
          You don't have permission to view this page.
          {user?.role && (
            <>
              <br />
              Your role: <span className="font-semibold capitalize">{user.role.replace("_", " ")}</span>
            </>
          )}
        </p>
        <Link to={home}>
          <Button variant="primary" size="lg" className="w-full">
            <ArrowLeft className="h-4 w-4" /> Go to your dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
