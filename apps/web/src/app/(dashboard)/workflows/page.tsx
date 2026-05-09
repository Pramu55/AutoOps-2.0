import type { Metadata } from "next";

export const metadata: Metadata = { title: "Workflows | AutoOps" };

const workflows = [
  { id: "1", name: "Incident Response", description: "Automated incident response with notification and escalation", isActive: true, runsTotal: 147, runsSuccess: 142, lastRun: "2 hours ago" },
  { id: "2", name: "Service Health Check", description: "Periodic health monitoring and alerting for all services", isActive: true, runsTotal: 1024, runsSuccess: 1019, lastRun: "5 minutes ago" },
  { id: "3", name: "Certificate Renewal", description: "Automated SSL certificate renewal and deployment", isActive: false, runsTotal: 12, runsSuccess: 12, lastRun: "30 days ago" },
];

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="text-gray-400 mt-1">Automate operations with workflow orchestration</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          Create Workflow
        </button>
      </div>
      <div className="space-y-4">
        {workflows.map((w) => (
          <div key={w.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-white">{w.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${w.isActive ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-500"}`}>
                    {w.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-gray-400">{w.description}</p>
              </div>
              <div className="flex items-center gap-3 ml-6">
                <button className="text-sm text-blue-400 hover:text-blue-300 font-medium">Trigger</button>
                <button className="text-sm text-gray-500 hover:text-gray-300">Edit</button>
              </div>
            </div>
            <div className="flex items-center gap-8 mt-4 pt-4 border-t border-[#2a2d3a]">
              <div><p className="text-xs text-gray-500">Total Runs</p><p className="text-sm font-medium text-white">{w.runsTotal.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-500">Success Rate</p><p className="text-sm font-medium text-green-400">{((w.runsSuccess / w.runsTotal) * 100).toFixed(1)}%</p></div>
              <div><p className="text-xs text-gray-500">Last Run</p><p className="text-sm font-medium text-white">{w.lastRun}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
