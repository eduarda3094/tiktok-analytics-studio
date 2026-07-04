import { NextResponse } from "next/server";
import { isNimAvailable } from "@/lib/nvidia-nim";

export async function GET() {
  return NextResponse.json({
    nimAvailable: isNimAvailable(),
    timestamp: new Date().toISOString(),
  });
}
