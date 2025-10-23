import { useState} from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Label } from "./components/ui/label";
// import {
//   projectId,
//   publicAnonKey,
// } from "./utils/supabase/info";
// import { Pencil, Trash2, Plus } from "lucide-react";

import './App.css'
import './index.css'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {count ? "Edit Customer" : "Add New Customer"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid w-full max-w-sm items-center gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="John Doe" />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john.doe@example.com"
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional information about the customer"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p>List of customers will be displayed here.</p>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent>
              <Button 
                variant="default"
                onClick={() => setCount((count) => count + 1)}
              >
                count is {count}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}