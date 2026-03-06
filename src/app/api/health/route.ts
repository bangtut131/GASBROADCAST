import { NextRequest, NextResponse } from 'next/server';

// Health check endpoint for Railway deployment
export async function GET(request: NextRequest) {
    return NextResponse.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        env: process.env.NODE_ENV,
    });
}
