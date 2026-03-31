import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

interface MetricsChartProps {
  data: { time: string; cpu: number; throughput: number }[];
}

const chartConfig = {
  cpu: { label: "CPU %", color: "hsl(var(--accent))" },
  throughput: { label: "Throughput tx/s", color: "hsl(var(--primary))" },
};

export function MetricsChart({ data }: MetricsChartProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-border/40 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
            CPU Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={{ cpu: chartConfig.cpu }} className="h-[180px] w-full">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} className="text-muted-foreground" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="var(--color-cpu)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
            Throughput
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={{ throughput: chartConfig.throughput }} className="h-[180px] w-full">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 9 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="throughput"
                stroke="var(--color-throughput)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
