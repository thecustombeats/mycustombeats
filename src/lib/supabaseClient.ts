import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://lzipqnkcewspqlrcbzdh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6aXBxbmtjZXdzcHFscmNiemRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTYxOTIsImV4cCI6MjA5Mjc5MjE5Mn0.IK46LJTLtzws-mwssqQns8VIpmdRkgavfUi3o7hXdgM";

export const supabase = createClient(supabaseUrl, supabaseKey);