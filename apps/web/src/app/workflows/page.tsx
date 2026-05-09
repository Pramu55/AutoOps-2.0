import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workflows | AutoOps",
};

const workflows = [
  {
    id: "1",
    name: "Incident Response",
    description: "Automated incident response with notification and escalation",
    isActive: true,
    runsTotal: 147,
    runsSuccess: 142,
    lastRun: "2 hours ago",
  },
  {
    id: "2",
    name: "Service Health Check",
    description: "Periodic health monitoring and alerting for all services",
    isActive: true,
    runsTotal: 1024,
    runsSuccess: 1019,
    lastRun: "5 minutes ago",
  },
  {
    id: "3",
    name: "Certificate Renewal",
    description: "Automated SSL certificate renewal and deployment",
    isActive: false,
    runsTotal: 12,
    runsSuccess: 12,
    lastRun: "30 days ago",
  },
];

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-gray-500 mt-1">
            Automate operations with workflow orchestration
          </p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Create Workflow
        </button>
      </div>

      <div className="space-y-4">
        {workflows.map((workflow) => (
          <div
            key={workflow.id}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      workflow.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {workflow.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{workflow.description}</p>
              </div>
              <div className="flex items-center gap-3 ml-6">
                <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Trigger
                </button>
                <button className="text-sm text-gray-500 hover:text-gray-700">
                  Edit
                </button>
              </div>
            </div>
            <div className="flex items-center gap-8 mt-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Total Runs</p>
                <p className="text-sm font-medium text-gray-900">
                  {workflow.runsTotal.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Success Rate</p>
                <p className="text-sm font-medium text-green-600">
                  {((workflow.runsSuccess / workflow.runsTotal) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Last Run</p>
                <p className="text-sm font-medium text-gray-900">{workflow.lastRun}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
