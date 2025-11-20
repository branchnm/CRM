import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import type { Equipment } from '../App';
import { Plus, Wrench, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';

interface SettingsProps {
  equipment: Equipment[];
  onUpdateEquipment: (equipment: Equipment[]) => void;
}

export function Settings({ equipment, onUpdateEquipment }: SettingsProps) {
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    lastMaintenance: new Date().toISOString().split('T')[0],
    nextMaintenance: '',
    hoursUsed: '0',
    alertThreshold: '50',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      lastMaintenance: new Date().toISOString().split('T')[0],
      nextMaintenance: '',
      hoursUsed: '0',
      alertThreshold: '50',
    });
  };

  const handleAddEquipment = () => {
    if (!formData.name || !formData.nextMaintenance) {
      toast.error('Please fill in equipment name and next maintenance date');
      return;
    }

    const newEquipment: Equipment = {
      id: Date.now().toString(),
      name: formData.name,
      lastMaintenance: formData.lastMaintenance,
      nextMaintenance: formData.nextMaintenance,
      hoursUsed: parseFloat(formData.hoursUsed),
      alertThreshold: parseFloat(formData.alertThreshold),
    };

    onUpdateEquipment([...equipment, newEquipment]);
    resetForm();
    setIsAddingEquipment(false);
    toast.success('Equipment added');
  };

  const handleLogMaintenance = (id: string) => {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const updatedEquipment = equipment.map(e =>
      e.id === id
        ? {
            ...e,
            lastMaintenance: today.toISOString(),
            nextMaintenance: nextMonth.toISOString(),
            hoursUsed: 0,
          }
        : e
    );

    onUpdateEquipment(updatedEquipment);
    toast.success('Maintenance logged');
  };

  const getDaysUntilMaintenance = (nextMaintenance: string) => {
    const next = new Date(nextMaintenance);
    const today = new Date();
    const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg md:text-xl">Equipment & Maintenance</CardTitle>
              <CardDescription className="text-sm">Track equipment and schedule maintenance</CardDescription>
            </div>
            <Dialog open={isAddingEquipment} onOpenChange={setIsAddingEquipment}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto text-sm" size="default" onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Equipment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Equipment</DialogTitle>
                  <DialogDescription>Track a new piece of equipment</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="equipment-name">Equipment Name</Label>
                    <Input
                      id="equipment-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Mower - Main"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="last-maintenance">Last Maintenance</Label>
                      <Input
                        id="last-maintenance"
                        type="date"
                        value={formData.lastMaintenance}
                        onChange={(e) => setFormData({ ...formData, lastMaintenance: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="next-maintenance">Next Maintenance</Label>
                      <Input
                        id="next-maintenance"
                        type="date"
                        value={formData.nextMaintenance}
                        onChange={(e) => setFormData({ ...formData, nextMaintenance: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hours-used">Hours Used</Label>
                      <Input
                        id="hours-used"
                        type="number"
                        value={formData.hoursUsed}
                        onChange={(e) => setFormData({ ...formData, hoursUsed: e.target.value })}
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="alert-threshold">Alert Threshold (hrs)</Label>
                      <Input
                        id="alert-threshold"
                        type="number"
                        value={formData.alertThreshold}
                        onChange={(e) => setFormData({ ...formData, alertThreshold: e.target.value })}
                        placeholder="50"
                      />
                    </div>
                  </div>

                  <Button onClick={handleAddEquipment} className="w-full bg-blue-600 hover:bg-blue-700">
                    Add Equipment
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Equipment List */}
      <div className="space-y-2 md:space-y-3">
        {equipment.map(item => {
          const daysUntil = getDaysUntilMaintenance(item.nextMaintenance);
          const needsMaintenance = daysUntil <= 7 || item.hoursUsed >= item.alertThreshold;

          return (
            <Card key={item.id} className={`bg-white/80 backdrop-blur ${needsMaintenance ? 'border-orange-300' : ''}`}>
              <CardContent className="pt-4 pb-4 px-3 md:px-6 md:pt-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="h-5 w-5 text-gray-600" />
                      <h3 className="text-blue-800">{item.name}</h3>
                      {needsMaintenance && (
                        <Badge className="bg-orange-600">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Maintenance Due
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1 text-sm text-gray-600">
                      <p>Last Maintenance: {new Date(item.lastMaintenance).toLocaleDateString()}</p>
                      <p>Next Maintenance: {new Date(item.nextMaintenance).toLocaleDateString()} ({daysUntil} days)</p>
                      <p>Hours Used: {item.hoursUsed} / {item.alertThreshold} hrs</p>
                    </div>

                    {item.hoursUsed >= item.alertThreshold && (
                      <Alert className="mt-3 border-orange-300 bg-orange-50">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Hours threshold reached. Schedule maintenance soon.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <Button
                    onClick={() => handleLogMaintenance(item.id)}
                    variant={needsMaintenance ? 'default' : 'outline'}
                    className={needsMaintenance ? 'bg-orange-600 hover:bg-orange-700' : ''}
                  >
                    Log Maintenance
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {equipment.length === 0 && (
          <Card className="bg-white/80 backdrop-blur">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">No equipment tracked yet. Add equipment to monitor maintenance.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50/80 backdrop-blur border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">Maintenance Tracking Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-blue-700">
            <li>• Set realistic maintenance intervals based on manufacturer recommendations</li>
            <li>• Log maintenance immediately after completing it to keep accurate records</li>
            <li>• Common maintenance: blade sharpening, oil changes, air filter replacement</li>
            <li>• Well-maintained equipment = better efficiency and fewer breakdowns</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
