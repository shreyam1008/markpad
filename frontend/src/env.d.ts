declare module "*.css";
declare module "*.txt" {
  const content: string;
  export default content;
}
