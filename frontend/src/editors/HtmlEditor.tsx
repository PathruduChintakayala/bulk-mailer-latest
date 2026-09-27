interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function HtmlEditor({ value, onChange }: Props) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-full min-h-[500px] p-4 font-mono text-sm bg-gray-900 text-green-400 focus:outline-none resize-none"
      placeholder="<!DOCTYPE html>
<html>
<head>
  <style>
    /* Your email styles */
  </style>
</head>
<body>
  <h1>Hello {{name}}!</h1>
  <p>Your email content here...</p>
</body>
</html>"
      spellCheck={false}
    />
  );
}
