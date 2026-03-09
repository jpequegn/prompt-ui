type DataRow = {
  name: string;
  email: string;
  role: string;
};

type Props = {
  data?: DataRow[];
};

const defaultData: DataRow[] = [
  { name: "John Smith", email: "john.smith@example.com", role: "Developer" },
  { name: "Sarah Johnson", email: "sarah.j@example.com", role: "Designer" },
  { name: "Michael Brown", email: "m.brown@example.com", role: "Manager" },
  { name: "Emily Davis", email: "emily.d@example.com", role: "Analyst" },
  { name: "James Wilson", email: "j.wilson@example.com", role: "Developer" },
];

export function DataTable({ data = defaultData }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
              Role
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map((row, index) => (
            <tr
              key={index}
              className={`${
                index % 2 === 0 ? "bg-white" : "bg-gray-50"
              } transition-colors duration-150 hover:bg-blue-50`}
            >
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                {row.name}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                {row.email}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                {row.role}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;