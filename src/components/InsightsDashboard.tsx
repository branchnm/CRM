import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import type { Customer, Job, Equipment } from '../App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, Users, DollarSign, AlertTriangle, Lightbulb } from 'lucide-react';

interface InsightsDashboardProps {
  customers: Customer[];
  jobs: Job[];
  equipment: Equipment[];
}

export function InsightsDashboard({ customers, jobs, equipment }: InsightsDashboardProps) {
  const completedJobs = jobs.filter(j => j.status === 'completed');

  // Debug info to help troubleshoot
  console.log('Debug - Insights Dashboard:', {
    totalJobs: jobs.length,
    completedJobs: completedJobs.length,
    jobs: jobs.map(j => ({ id: j.id, status: j.status, date: j.date })),
    customers: customers.map(c => ({ id: c.id, name: c.name, nextCutDate: c.nextCutDate }))
  });

  if (completedJobs.length === 0) {
    return (
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle>No Data Yet</CardTitle>
          <CardDescription>
            Complete jobs to see insights and recommendations
            <br />
            <small className="text-gray-500">
              Debug: {jobs.length} total jobs, {completedJobs.length} completed
            </small>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Calculate metrics
  const totalRevenue = completedJobs.reduce((sum, job) => {
    const customer = customers.find(c => c.id === job.customerId);
    return sum + (customer?.price || 0);
  }, 0);

  const avgJobTime = completedJobs.reduce((sum, job) => sum + (job.totalTime || 0), 0) / completedJobs.length;
  const totalWorkHours = completedJobs.reduce((sum, job) => sum + (job.totalTime || 0), 0) / 60;
  
  // Calculate drive time metrics
  const totalDriveTime = completedJobs.reduce((sum, job) => sum + (job.driveTime || 0), 0);
  const totalDriveHours = totalDriveTime / 60;
  const avgDriveTimePerJob = completedJobs.length > 0 ? totalDriveTime / completedJobs.length : 0;
  const driveTimePercentage = totalWorkHours > 0 ? (totalDriveHours / (totalWorkHours + totalDriveHours)) * 100 : 0;

  // Calculate hourly rate
  const hourlyRate = totalRevenue / totalWorkHours;

  // Identify underpriced properties
  const jobsWithMetrics = completedJobs.map(job => {
    const customer = customers.find(c => c.id === job.customerId);
    if (!customer || !job.totalTime) return null;
    
    const timePerKSqFt = (job.totalTime / (customer.squareFootage / 1000));
    const pricePerKSqFt = customer.price / (customer.squareFootage / 1000);
    const effectiveHourlyRate = (customer.price / job.totalTime) * 60;
    
    return {
      customer,
      job,
      timePerKSqFt,
      pricePerKSqFt,
      effectiveHourlyRate,
    };
  }).filter(Boolean);

  const avgEffectiveRate = jobsWithMetrics.reduce((sum, item) => sum + (item?.effectiveHourlyRate || 0), 0) / jobsWithMetrics.length;
  const underpricedJobs = jobsWithMetrics.filter(item => item && item.effectiveHourlyRate < avgEffectiveRate * 0.8);

  // Hiring recommendation
  const last7Days = jobs.filter(j => {
    const jobDate = new Date(j.date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return jobDate >= weekAgo && j.status === 'completed';
  });

  const weeklyWorkHours = last7Days.reduce((sum, job) => sum + (job.totalTime || 0), 0) / 60;
  const shouldHire = weeklyWorkHours > 35;

  // Weekly trend
  const last4Weeks = Array.from({ length: 4 }, (_, i) => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    
    const weekJobs = completedJobs.filter(j => {
      const jobDate = new Date(j.date);
      return jobDate >= weekStart && jobDate < weekEnd;
    });
    
    const weekRevenue = weekJobs.reduce((sum, job) => {
      const customer = customers.find(c => c.id === job.customerId);
      return sum + (customer?.price || 0);
    }, 0);
    
    const weekHours = weekJobs.reduce((sum, job) => sum + (job.totalTime || 0), 0) / 60;
    
    return {
      week: `Week ${4 - i}`,
      revenue: weekRevenue,
      hours: parseFloat(weekHours.toFixed(1)),
      jobs: weekJobs.length,
    };
  }).reverse();

  // Customer profitability
  const customerProfitability = customers.map(customer => {
    const customerJobs = completedJobs.filter(j => j.customerId === customer.id);
    if (customerJobs.length === 0) return null;
    
    const avgTime = customerJobs.reduce((sum, job) => sum + (job.totalTime || 0), 0) / customerJobs.length;
    const effectiveRate = (customer.price / avgTime) * 60;
    
    return {
      name: customer.name,
      price: customer.price,
      avgTime: parseFloat(avgTime.toFixed(1)),
      effectiveRate: parseFloat(effectiveRate.toFixed(2)),
      jobCount: customerJobs.length,
    };
  }).filter(Boolean).sort((a, b) => (b?.effectiveRate || 0) - (a?.effectiveRate || 0));

  // Equipment alerts
  const equipmentAlerts = equipment.filter(e => {
    const nextMaintenance = new Date(e.nextMaintenance);
    const today = new Date();
    const daysUntil = Math.ceil((nextMaintenance.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 7 || e.hoursUsed >= e.alertThreshold;
  });

  // Generate insights
  const insights = [];

  if (shouldHire) {
    insights.push({
      type: 'hiring',
      title: 'Consider Hiring Additional Crew',
      description: `You're working ${weeklyWorkHours.toFixed(1)} hours/week. Hiring a crew member could help you scale and take on more customers.`,
      icon: Users,
    });
  }

  if (underpricedJobs.length > 0) {
    insights.push({
      type: 'pricing',
      title: 'Underpriced Properties Detected',
      description: `${underpricedJobs.length} properties are generating below-average hourly rates. Consider adjusting pricing.`,
      icon: DollarSign,
    });
  }
  
  // Drive time optimization insights
  if (driveTimePercentage > 25) {
    insights.push({
      type: 'efficiency',
      title: 'High Drive Time Detected',
      description: `${driveTimePercentage.toFixed(1)}% of your time is spent driving. Consider grouping jobs by area or optimizing routes to reduce drive time.`,
      icon: Lightbulb,
    });
  }
  
  if (avgDriveTimePerJob > 15) {
    insights.push({
      type: 'routing',
      title: 'Long Drive Times Between Jobs',
      description: `Average drive time is ${avgDriveTimePerJob.toFixed(1)} minutes per job. Try scheduling jobs in the same neighborhood together.`,
      icon: AlertTriangle,
    });
  }

  if (equipmentAlerts.length > 0) {
    insights.push({
      type: 'maintenance',
      title: 'Equipment Maintenance Needed',
      description: `${equipmentAlerts.length} equipment items need attention soon to avoid downtime.`,
      icon: AlertTriangle,
    });
  }

  if (hourlyRate > 60) {
    insights.push({
      type: 'success',
      title: 'Excellent Profitability',
      description: `You're earning $${hourlyRate.toFixed(2)}/hour on average. Great work!`,
      icon: TrendingUp,
    });
  } else if (hourlyRate < 40) {
    insights.push({
      type: 'improvement',
      title: 'Improve Hourly Rate',
      description: `Current rate is $${hourlyRate.toFixed(2)}/hour. Focus on efficiency or adjust pricing to reach $50+/hour.`,
      icon: Lightbulb,
    });
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-blue-600">${totalRevenue.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Hourly Rate</CardDescription>
            <CardTitle className="text-blue-600">${hourlyRate.toFixed(2)}/hr</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Total Work Hours</CardDescription>
            <CardTitle className="text-purple-600">{totalWorkHours.toFixed(1)} hrs</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Avg Job Time</CardDescription>
            <CardTitle className="text-orange-600">{avgJobTime.toFixed(0)} min</CardTitle>
          </CardHeader>
        </Card>
        
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Total Drive Time</CardDescription>
            <CardTitle className="text-red-600">{totalDriveHours.toFixed(1)} hrs</CardTitle>
          </CardHeader>
        </Card>
        
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Avg Drive Time/Job</CardDescription>
            <CardTitle className="text-yellow-600">{avgDriveTimePerJob.toFixed(1)} min</CardTitle>
          </CardHeader>
        </Card>
        
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Drive Time %</CardDescription>
            <CardTitle className="text-indigo-600">{driveTimePercentage.toFixed(1)}%</CardTitle>
          </CardHeader>
        </Card>
        
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription>Completed Jobs</CardDescription>
            <CardTitle className="text-teal-600">{completedJobs.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Insights & Recommendations */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-blue-800">Insights & Recommendations</h2>
          {insights.map((insight, idx) => (
            <Alert
              key={idx}
              className={
                insight.type === 'hiring' ? 'border-blue-300 bg-blue-50/80' :
                insight.type === 'pricing' ? 'border-orange-300 bg-orange-50/80' :
                insight.type === 'maintenance' ? 'border-red-300 bg-red-50/80' :
                insight.type === 'success' ? 'border-blue-300 bg-blue-50/80' :
                'border-purple-300 bg-purple-50/80'
              }
            >
              <insight.icon className="h-4 w-4" />
              <AlertTitle>{insight.title}</AlertTitle>
              <AlertDescription>{insight.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Weekly Performance</CardTitle>
            <CardDescription>Revenue and hours over last 4 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={last4Weeks}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#22c55e" name="Revenue ($)" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="hours" stroke="#3b82f6" name="Hours" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Customer Profitability</CardTitle>
            <CardDescription>Top 5 customers by effective hourly rate</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={customerProfitability.slice(0, 5)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-15} textAnchor="end" height={80} />
                <YAxis label={{ value: '$/hour', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="effectiveRate" fill="#8b5cf6" name="Effective Rate" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Underpriced Properties */}
      {underpricedJobs.length > 0 && (
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Underpriced Properties</CardTitle>
            <CardDescription>Properties with below-average profitability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {underpricedJobs.slice(0, 5).map((item, idx) => {
                if (!item) return null;
                const lostRevenue = (avgEffectiveRate - item.effectiveHourlyRate) * (item.job.totalTime! / 60);
                return (
                  <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="text-blue-800">{item.customer.name}</h4>
                      <p className="text-gray-600 text-sm">{item.customer.address}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline">Current: ${item.customer.price}</Badge>
                        <Badge variant="outline">{item.job.totalTime} min avg</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-red-600">${item.effectiveHourlyRate.toFixed(2)}/hr</p>
                      <p className="text-sm text-gray-600">vs ${avgEffectiveRate.toFixed(2)}/hr avg</p>
                      <p className="text-sm text-red-600 mt-1">-${lostRevenue.toFixed(2)} per job</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Customer Performance */}
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle>All Customers Performance</CardTitle>
          <CardDescription>Complete breakdown of customer profitability</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {customerProfitability.map((customer, idx) => {
              if (!customer) return null;
              const isAboveAvg = customer.effectiveRate >= avgEffectiveRate;
              return (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="text-blue-800">{customer.name}</p>
                    <p className="text-sm text-gray-600">{customer.jobCount} jobs completed</p>
                  </div>
                  <div className="text-right">
                    <p className={isAboveAvg ? 'text-blue-600' : 'text-orange-600'}>
                      ${customer.effectiveRate}/hr
                    </p>
                    <p className="text-sm text-gray-600">${customer.price} / {customer.avgTime} min</p>
                  </div>
                  <Badge className={isAboveAvg ? 'bg-blue-600 ml-3' : 'bg-orange-600 ml-3'}>
                    {isAboveAvg ? 'Good' : 'Review'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
