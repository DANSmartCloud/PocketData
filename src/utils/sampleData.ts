import type { DTAFile, Variable } from "@/stores/fileStore";

const sampleData: Record<string, unknown>[] = [
  { id: 1, name: "张三", age: 28, salary: 8500.50, city: "北京" },
  { id: 2, name: "李四", age: 35, salary: 12000.00, city: "上海" },
  { id: 3, name: "王五", age: 42, salary: 15000.75, city: "广州" },
  { id: 4, name: "赵六", age: 31, salary: 9500.25, city: "深圳" },
  { id: 5, name: "钱七", age: 26, salary: 7200.00, city: "杭州" },
];

const sampleVariables: Variable[] = [
  { name: "id", type: "long", label: "编号" },
  { name: "name", type: "string", label: "姓名" },
  { name: "age", type: "int", label: "年龄" },
  { name: "salary", type: "double", label: "工资" },
  { name: "city", type: "string", label: "城市" },
];

export const sampleFile: DTAFile = {
  id: "sample_data",
  path: "sample_data.dta",
  name: "sample_data.dta",
  version: 118,
  nvar: 5,
  nobs: 5,
  variables: sampleVariables,
  data: sampleData,
  valueLabels: {},
  timestamp: "2026-01-15",
  label: "示例数据文件",
  isDirty: false
};

export { sampleData, sampleVariables };
