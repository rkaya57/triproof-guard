declare module "ipaddr.js" {
  type AddressKind = "ipv4" | "ipv6"

  interface Address {
    kind(): AddressKind
    range(): string
    toString(): string
    toByteArray(): number[]
  }

  interface IpAddr {
    isValid(value: string): boolean
    parse(value: string): Address
    process(value: string): Address
  }

  const ipaddr: IpAddr
  export = ipaddr
}
